import styles from "../PdfEditor/PdfEditor.module.css";
import PropTypes from "prop-types";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
} from "pdf-lib";

import ZoomOutIcon from "../../assets/icons/ZoomOutIcon";
import ZoomInIcon from "../../assets/icons/ZoomInIcon";
import SaveAsIcon from "../../assets/icons/SaveAsIcon";

const zoomLevels = [
  0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 3.5, 4.0,
];

GlobalWorkerOptions.workerSrc =
  "https://unpkg.com/pdfjs-dist/build/pdf.worker.min.mjs";

const PdfEditor = forwardRef(({ src }, ref) => {
  const divRef = useRef(null);
  const [maxPageWidth, setMaxPageWidth] = useState(0);
  const [zoomLevel, setZoomLevel] = useState(6);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [docReady, setDocReady] = useState(false);
  const [pages, setPages] = useState([]);
  const [pagesReady, setPagesReady] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const loadDocument = async () => {
      setDocReady(false);
      setPdfDoc(await getDocument(src).promise);
      setDocReady(true);
    };
    loadDocument();
    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
        setPdfDoc(null);
        setDocReady(false);
      }
    };
  }, [src]);

  useEffect(() => {
    const loadFormFieldsAndPages = async () => {
      if (pdfDoc) {
        const rawFormFields = await pdfDoc.getFieldObjects();
        const rawPages = [];
        setPagesReady(false);
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          const proxy = await pdfDoc.getPage(i);
          const fields = Object.values(rawFormFields).flatMap((rawFields) =>
            rawFields.filter(
              (rawField) =>
                //rawField.editable &&
                //!rawField.hidden &&
                rawField.page === proxy.pageNumber - 1
            )
          );
          rawPages.push({ proxy, fields });
        }
        setPages(rawPages);
        setPagesReady(true);
      }
    };
    loadFormFieldsAndPages();
  }, [docReady]);

  const renderPages = useCallback(
    (scale) => {
      let maxPageActualWidth = 0;
      pages.forEach((page) => {
        const viewport = page.proxy.getViewport({ scale });
        const actualWidth = page.proxy.getViewport({ scale: 1.0 }).width;
        if (actualWidth > maxPageActualWidth) {
          maxPageActualWidth = actualWidth;
        }
        const sourceCanvas = divRef.current?.querySelector(
          "canvas#page_canvas_" + page.proxy.pageNumber
        );
        if (sourceCanvas) {
          const sourceContext = sourceCanvas.getContext("2d");
          const ratio = window.devicePixelRatio || 1;
          sourceCanvas.height = viewport.height * ratio;
          sourceCanvas.width = viewport.width * ratio;
          sourceCanvas.style.width = viewport.width + "px";
          sourceCanvas.style.height = viewport.height + "px";
          if (sourceContext) {
            page.proxy.render({
              canvasContext: sourceContext,
              viewport: page.proxy.getViewport({
                scale: scale * ratio,
              }),
            });
          }
        }
        const pageDivContainer = divRef.current?.querySelector(
          "div#page_div_container_" + page.proxy.pageNumber
        );
        pageDivContainer?.querySelectorAll("input, select").forEach((e) => {
          const input = e;
          const rect = page.fields
            ?.find((field) => field.name === input.name)
            ?.rect?.map((x) => x * scale);
          if (rect) {
            input.style.left = rect[0] + "px";
            input.style.top = viewport.height - rect[3] + "px";
            input.style.width = rect[2] - rect[0] + "px";
            input.style.height = rect[3] - rect[1] + "px";
          }
        });
      });
      if (maxPageWidth === 0) {
        setMaxPageWidth(maxPageActualWidth);
      }
    },
    [pages]
  );

  useEffect(() => {
    if (pagesReady) {
      renderPages(zoomLevels[zoomLevel]);
    }
  }, [pagesReady, renderPages, zoomLevel]);

  const resetViewScale = useCallback(
    (divWidth) => {
      if (divWidth && maxPageWidth) {
        const scaleValue = divWidth / maxPageWidth;
        let minDifference = Infinity;
        let closestZoomLevel;
        for (let i = 0; i < zoomLevels.length; i++) {
          const difference = Math.abs(scaleValue - zoomLevels[i]);
          if (difference < minDifference) {
            minDifference = difference;
            closestZoomLevel = i;
          }
        }
        setZoomLevel(closestZoomLevel || 6);
      }
    },
    [maxPageWidth]
  );

  useEffect(() => {
    const handleResize = () => {
      resetViewScale(divRef?.current?.offsetWidth);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [resetViewScale]);

  const getAllFieldsValue = () => {
    const fieldElements = divRef?.current?.querySelectorAll("input, select");
    return fieldElements
      ? Array.from(fieldElements)
          .map((e) => {
            const field = e;
            //console.log(field);
            const selectElement = e;
            let value = field.value;
            switch (field.type) {
              case "checkbox":
                value = field.checked ? "On" : "Off";
                break;
              case "combobox":
                value =
                  selectElement.options[selectElement.selectedIndex].value;
                break;
              default:
                break;
            }
            return {
              [field.name]: value,
            };
          })
          .reduce((result, currentObject) => {
            return { ...result, ...currentObject };
          }, {})
      : {};
  };

  useImperativeHandle(ref, () => ({
    formFields: getAllFieldsValue(),
  }));

  const downloadPDF = (data, fileName) => {
    const downloadLink = document.createElement("a");
    downloadLink.href = window.URL.createObjectURL(data);
    downloadLink.download = fileName || "download.pdf";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    window.URL.revokeObjectURL(downloadLink.href);
  };

  const saveFileUsingFilePicker = async (data, fileName) => {
    try {
      const blob = new Blob([data], { type: "application/pdf" });
      const { showSaveFilePicker } = window;
      if (showSaveFilePicker) {
        // Request a file handle using showSaveFilePicker
        const fileHandle = await showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "PDF Documents",
              accept: {
                "application/pdf": [".pdf"],
              },
            },
          ],
        });

        // Create a writable stream from the file handle
        const writable = await fileHandle.createWritable();

        // Write the blob data to the stream
        await writable.write(blob);

        // Close the stream to finish writing
        await writable.close();
      } else {
        downloadPDF(blob, fileName);
      }
    } catch (error) {
      console.error("Error saving file:", error);
    }
  };

  const onSaveAs = async () => {
    console.log("onSaveAs");
    setIsSaving(true);
    const originData = await pdfDoc?.getData();
    if (originData) {
      const libDoc = await PDFDocument.load(originData);
      const form = libDoc.getForm();
      const formFields = getAllFieldsValue();

      console.log(formFields);
      if (form) {
        for (const field of form.getFields()) {
          const name = field.getName();
          console.log(`Name: ${name}`);

          const value = formFields[field.getName()];
          console.log(`Value: ${value}`);

          const type = field.constructor.name;
          console.log(`Type: ${type}`);

          const isReadOnly = field.isReadOnly();
          console.log(`isReadOnly: ${isReadOnly}`);

          const isRequired = field.isRequired();
          console.log(`isRequired : ${isRequired}`);

          console.log("-------------------");

          if (field instanceof PDFTextField) {
            field.setText(value);
          } else if (field instanceof PDFCheckBox) {
            if (value === "On") {
              field.check();
            } else {
              field.uncheck();
            }
          } else if (field instanceof PDFDropdown) {
            field.select(value);
          } else if (field instanceof PDFOptionList) {
            // FIXME...not render the input elements for this part field yet
            // TODO... handle multiple select, choice type in pdf.js
          } else if (field instanceof PDFRadioGroup) {
            // TODO... handle A set of radio buttons where users can select only one option from the group.
            // Specifically, for a radio button in a radio group, the fieldFlags property of the field object may contain the RADIO flag.
          }
        }
        const savedData = await libDoc.save();

        let fileName = "download.pdf";
        if (typeof src === "string") {
          if (src.lastIndexOf("/") >= 0) {
            fileName = src.substring(src.lastIndexOf("/") + 1);
          }
        } else if (src instanceof URL) {
          const url = src.href;
          if (url.lastIndexOf("/") >= 0) {
            fileName = url.substring(url.lastIndexOf("/") + 1);
          }
        }
        await saveFileUsingFilePicker(savedData, fileName || "download.pdf");
      }
    }
    setIsSaving(false);
  };

  if (!docReady || !pagesReady) return null;

  return (
    <div className={styles.rootContainer}>
      <div className={styles.toolbarContainer}>
        <button
          className={styles.toolbarButton}
          title="Zoom Out"
          onClick={() => setZoomLevel(zoomLevel - 1)}
          disabled={zoomLevel <= 0}
          type="button"
        >
          <ZoomOutIcon className={styles.svgIcon} />
        </button>
        <button
          title="Zoom In"
          className={styles.toolbarButton}
          onClick={() => setZoomLevel(zoomLevel + 1)}
          disabled={zoomLevel >= zoomLevels.length - 1}
          type="button"
        >
          <ZoomInIcon className={styles.svgIcon} />
        </button>
        <button
          title="Save as"
          className={styles.toolbarButton}
          onClick={onSaveAs}
          type="button"
          disabled={isSaving}
        >
          <SaveAsIcon className={styles.svgMediumIcon} />
        </button>
      </div>
      <div ref={divRef} className={styles.pdfContainer}>
        {pages &&
          pages.length > 0 &&
          pages
            .filter((page) => !page.proxy?.destroyed)
            .map((page) => (
              <div
                id={"page_div_container_" + page.proxy.pageNumber}
                key={"page_" + page.proxy.pageNumber}
                className={styles.pdfPageContainer}
              >
                <canvas id={"page_canvas_" + page.proxy.pageNumber} />
                {page.fields &&
                  page.fields
                    .filter((item) => item.editable !== false)
                    .map((field) => {
                      if (field.type === "combobox")
                        return (
                          <select
                            name={field.name}
                            title={field.name}
                            key={field.name}
                            defaultValue={field.defaultValue}
                            className={styles.pdfSelect}
                          >
                            {field.items?.map((item) => (
                              <option
                                key={item.exportValue}
                                value={item.exportValue}
                              >
                                {item.displayValue}
                              </option>
                            ))}
                          </select>
                        );
                      return (
                        <input
                          type={field.type}
                          defaultValue={field.defaultValue}
                          name={field.name}
                          key={field.name}
                          className={styles.pdfInput}
                        />
                      );
                    })}
              </div>
            ))}
      </div>
    </div>
  );
});

PdfEditor.displayName = "PdfEditor";

PdfEditor.propTypes = {
  src: PropTypes.string.isRequired,
};

export default PdfEditor;
