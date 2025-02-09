import {useState, useRef, useEffect} from "react";
import PropTypes from "prop-types";

import {Button} from "primereact/button";
import {Paginator} from "primereact/paginator";
import {InputNumber} from 'primereact/inputnumber';
import {Toast} from 'primereact/toast';
import {Dialog} from "primereact/dialog";
import {Divider} from 'primereact/divider';
import {Document, Page, pdfjs} from "react-pdf";

import {SeverityEnum} from "../Utils/Enums/PrimeReactEnums.js"
import "./pdfViwer.css";


pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

const DEFAULT_PAGE_COUNT = 0;
const DEFAULT_CURRENT_PAGE = 1;
const DEFAULT_SCROLL_DETECTED_PAGE_RATE = 1.2;

const DEFAULT_ZOOM_RATE = 1.5;
const DEFAULT_ZOOM_MAX_IN_RATE = 2;
const DEFAULT_ZOOM_MAX_IN_MESSAGE = "Maksimum yakınlaştırma değerindesiniz.";
const DEFAULT_ZOOM_MIN_OUT_RATE = 0.5;
const DEFAULT_ZOOM_MAX_OUT_MESSAGE = "Minimum uzaklaştırma değerindesiniz.";

const DEFAULT_PAGINATOR_FIRST = 0;
const DEFAULT_PAGINATOR_ROW = 1;
const DEFAULT_PAGINATOR_PAGE_TEXT = "Sayfa";
const DEFAULT_PAGINATOR_INPUT_NOT_FOUND_ERROR = "Sayfa değer boş bırakılamaz!"
const DEFAULT_PAGINATOR_INPUT_TOOLTIP = "Bu sayfaya gitmek için 'Enter' tuşuna basın.";

const DEFAULT_ERROR_ALERT_SUMMARY = "Hatalı İşlem";
const DEFAULT_WARNING_ALERT_SUMMARY = "Geçersiz İşlem";
const DEFAULT_ALERT_DURATION = 2000;

const PdfViewerDialog = ({dialogHeader = "Pdf Viewer Dialog", dialogVisible, dialogHide, pdf}) => {
    const [pageCount, setPageCount] = useState(DEFAULT_PAGE_COUNT);
    const [zoomRate, setZoomRate] = useState(DEFAULT_ZOOM_RATE);
    const [currentPage, setCurrentPage] = useState(DEFAULT_CURRENT_PAGE);
    const [first, setFirst] = useState(DEFAULT_PAGINATOR_FIRST);
    const [rows, setRows] = useState(DEFAULT_PAGINATOR_ROW);

    const pageRefs = useRef([]);
    const pdfContainerRef = useRef(null);
    const paginatorInputRef = useRef(null);
    const alertRef = useRef(null);

    let PAGINATOR_PAGE_NUMBER_ERROR_MSG = `Sayfa Değeri 1 ile ${pageCount} arasında olmak zorundadır.`;

    useEffect(() => {
        setCurrentPage(first + 1);
    }, [first])

    useEffect(() => {
        if (paginatorInputRef.current) {
            paginatorInputRef.current.focus();
        }
    }, [currentPage])

    useEffect(() => {

        const handleScroll = () => {
            if (!pdfContainerRef.current) return;

            const pageHeight = window.innerHeight;
            const containerRect = pdfContainerRef.current.getBoundingClientRect();

            if (containerRect.top < pageHeight && containerRect.bottom > 0) {
                for (let i = 0; i < pageCount; i++) {
                    if (pageRefs.current[i]) {
                        const pageTop = pageRefs.current[i].getBoundingClientRect().top;
                        const adjustedPageTop = pageTop * zoomRate;
                        if (adjustedPageTop < pageHeight && adjustedPageTop > -pageHeight / DEFAULT_SCROLL_DETECTED_PAGE_RATE) {
                            setFirst(i * rows);
                            break;
                        }
                    }
                }
            }
        };

        const pdfContainer = pdfContainerRef.current;

        if (pdfContainer) {
            pdfContainer.addEventListener("scroll", handleScroll);

            return () => {
                pdfContainer.removeEventListener("scroll", handleScroll);
            };
        }
    }, [pageCount, rows]);

    const onDocumentLoadSuccess = ({numPages}) => {
        setPageCount(numPages);
    };

    // direk chrome viewer üzerinden kaydetme ve yazdırma yaptığı için editable alanlar geliyor
    const onPrintPdfv2 = () => {
        const printWindow = window.open(pdf, "_blank");
        if (printWindow) {
            printWindow.onload = () => {
                printWindow.focus();
                printWindow.print();
            };
        }
    };

    // pdf'i okuyup cansava yazarak kaydetme ve yazdırma yaptığı için editable alanlar gelmiyor !
    const onPrintPdf = async () => {
        const loadingTask = pdfjs.getDocument(pdf);
        const pdfDoc = await loadingTask.promise;
        const printCanvas = document.createElement("canvas");
        const ctx = printCanvas.getContext("2d");

        let pdfPages = [];
        for (let i = 1; i <= pdfDoc.numPages; i++) {
            const page = await pdfDoc.getPage(i);
            const viewport = page.getViewport({scale: 2});
            printCanvas.width = viewport.width;
            printCanvas.height = viewport.height;

            await page.render({canvasContext: ctx, viewport}).promise;
            pdfPages.push(printCanvas.toDataURL("image/png"));
        }

        const printWindow = window.open("", "_blank");
        if (printWindow) {
            printWindow.document.write(`
            <html>
            <head>
                <title>HTML Tutorial</title>
                <style>
                    @page { margin: 0; }
                    body { margin: 0; padding: 0; }
                    img { width: 100%; display: block; }
                </style>
            </head>
            <body>
        `);

            pdfPages.forEach((page, index) => {
                const img = printWindow.document.createElement("img");
                img.src = page;
                img.onload = () => {
                    if (index + 1 === pdfPages.length) {
                        printWindow.print(); // Tüm img'ler yüklendiğinde yazdır
                    }
                };
                printWindow.document.body.appendChild(img);
            });

            printWindow.document.write("</body></html>");
            printWindow.document.close();
        }
    };

    const zoomIn = () => {
        if (zoomRate > DEFAULT_ZOOM_MAX_IN_RATE) {
            showAlert(SeverityEnum.info, DEFAULT_WARNING_ALERT_SUMMARY, DEFAULT_ZOOM_MAX_IN_MESSAGE);
            return false;
        }

        setZoomRate(zoomRate + 0.1);
        return true;
    }

    const zoomOut = () => {
        if (zoomRate < DEFAULT_ZOOM_MIN_OUT_RATE) {
            showAlert(SeverityEnum.info, DEFAULT_WARNING_ALERT_SUMMARY, DEFAULT_ZOOM_MAX_OUT_MESSAGE);
            return false;
        }

        setZoomRate(zoomRate - 0.1);
        return true;
    }

    const zoomText = `Zoom: ${(zoomRate * 100).toFixed(0)}% `;

    const onPaginatorPageChange = (event) => {
        setFirst(event.first);
        setRows(event.rows);
        scrollWithPageNumber(event.first);
    };

    const onPaginatorInputChange = (event) => {
        const value = event.target.value;

        if (pageCount !== 0 && value !== 'undefined' && value !== '' && !isNaN(value)) {
            setCurrentPage(Number(value));
        }
    };

    const handlePaginatorInput = (inputValue) => {
        if (inputValue === '') {
            showAlert(SeverityEnum.error, DEFAULT_ERROR_ALERT_SUMMARY, DEFAULT_PAGINATOR_INPUT_NOT_FOUND_ERROR);
            return false;
        }

        const page = Number(inputValue) - 1;

        if (page < 0 || page >= pageCount) {
            showAlert(SeverityEnum.error, DEFAULT_ERROR_ALERT_SUMMARY, PAGINATOR_PAGE_NUMBER_ERROR_MSG);
            return false;
        }

        setFirst(page);
        scrollWithPageNumber(page);

        return true;
    };

    const onPaginatorInputKeyDown = (e) => {
        if (e.key === 'Enter') {
            handlePaginatorInput(e.target.value);
        }
    };

    const scrollWithPageNumber = (pageNumber) => {
        if (pageRefs.current[pageNumber]) {
            pageRefs.current[pageNumber].scrollIntoView({
                block: "start",
                behavior: "smooth",
                inline: "nearest",
            });
        }
    }

    const showAlert = (severity, summary, detail) => {
        alertRef.current.show({
            severity: `${severity}`, summary: `${summary}`, detail: `${detail}`, life: DEFAULT_ALERT_DURATION
        });
    };

    const pdfViewerPaginatorTemplate = {
        layout: 'FirstPageLink PrevPageLink CurrentPageReport NextPageLink LastPageLink', CurrentPageReport: () => {
            return (<span style={{color: 'var(--text-color)', userSelect: 'none'}}>
                    {DEFAULT_PAGINATOR_PAGE_TEXT}
                <InputNumber
                    style={{paddingLeft: '5px', paddingRight: '5px'}}
                    className="p-inputtext-sm"
                    inputRef={paginatorInputRef}
                    size={1}
                    min={1}
                    tooltip={DEFAULT_PAGINATOR_INPUT_TOOLTIP}
                    max={pageCount}
                    value={currentPage}
                    onKeyDown={(e) => onPaginatorInputKeyDown(e)}
                    onValueChange={onPaginatorInputChange}
                />/ {pageCount}
                </span>);
        }
    };

    function footerContent() {
        return (<div className="pdf-viewer-dialog-footer">
            <div className="pdf-viewer-paginator">
                <Paginator template={pdfViewerPaginatorTemplate} first={first} rows={rows}
                           totalRecords={pageCount}
                           onPageChange={onPaginatorPageChange}/>
            </div>
            <Divider layout="vertical"/>
            <div className="pdf-viewer-zoom">
                <Button
                    style={{outline: "none"}}
                    icon="pi pi-search-minus"
                    severity="secondary"
                    text
                    onClick={zoomOut}
                    size="large"
                />
                <p style={{padding: "10px"}}>{zoomText}</p>
                <Button
                    icon="pi pi-search-plus"
                    severity="secondary"
                    text
                    onClick={zoomIn}
                    size="large"
                />
            </div>
            <Divider layout="vertical"/>
            <div className="pdf-viewer-buttons">
                <Button
                    onClick={onPrintPdf}
                    icon="pi pi-print"
                    size="large"
                    severity="secondary"
                    text
                />
            </div>
        </div>);
    }

    return (<>
        <Toast ref={alertRef} position="bottom-right"/>
        <Dialog
            header={dialogHeader}
            visible={dialogVisible}
            onHide={dialogHide}
            draggable={false}
            footer={footerContent}
        >
            <div
                className="pdf-viewer-container" ref={pdfContainerRef}>
                <div className="pdf-viewer-body">
                    <Document
                        className="pdf-document"
                        file={pdf}
                        onLoadSuccess={onDocumentLoadSuccess}
                    >
                        {Array.from({length: pageCount}, (_, index) => (<div
                            ref={(el) => (pageRefs.current[index] = el)}
                            key={`page_${index + 1}`}
                        >
                            <Page
                                pageNumber={index + 1}
                                width={500 * zoomRate}
                                className="pdf-page"
                            />
                        </div>))}
                    </Document>
                </div>
            </div>
        </Dialog>
    </>);
};

PdfViewerDialog.propTypes = {
    dialogHeader: PropTypes.string,
    dialogVisible: PropTypes.bool.isRequired,
    dialogHide: PropTypes.func.isRequired,
    pdf: PropTypes.string
};

export default PdfViewerDialog;
