import {useRef, useState} from "react";

import pdf from "./assets/pdfs/LoremIpsum.pdf";
import {Button} from "primereact/button";
import {Dialog} from "primereact/dialog";

import "./app.css";

import CustomPdfViewer from "./components/CustomPdfViewer/CustomPdfViewer.jsx";
import PdfEditor from "./components/PdfEditor/PdfEditor.jsx";
import PdfViewerDialog from "./components/PdfViewerDialog.jsx";

function App() {
    const [pdfViewerVisible, setPdfViewerVisible] = useState(true);

    return (
        <div className="">
            <PdfViewerDialog
                pdf={pdf}
                dialogVisible={pdfViewerVisible}
                dialogHeader="Pdf Önizleme"
                dialogHide={() => setPdfViewerVisible(false)}/>
            {/*<PdfEditor src={pdf} />*/}
        </div>
    );
}

export default App;
