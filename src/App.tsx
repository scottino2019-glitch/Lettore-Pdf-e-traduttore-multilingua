import React, { useState, useRef, useEffect } from 'react';

// Declaration for global pdfjsLib from CDN
declare const window: Window & {
  pdfjsLib?: any;
};

interface PageTextData {
  pageNumber: number;
  text: string;
}

export default function App() {
  // --- PDF READER STATE (Inalterato e fedele alle funzioni originali) ---
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [currentPageText, setCurrentPageText] = useState<string>('');
  const [allExtractedText, setAllExtractedText] = useState<string>('');
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [showAlert, setShowAlert] = useState<boolean>(false);
  const [alertMessage, setAlertMessage] = useState<string>('✅ Testo copiato negli appunti!');
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  // --- TRADUTTORE STATE (Migliorato per testi lunghi di qualsiasi dimensione) ---
  const [inputText, setInputText] = useState<string>('');
  const [outputText, setOutputText] = useState<string>('');
  const [sourceLang, setSourceLang] = useState<string>('auto');
  const [targetLang, setTargetLang] = useState<string>('it');
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translateProgress, setTranslateProgress] = useState<number>(0);
  const [translateStatus, setTranslateStatus] = useState<string>('');
  const [copiedTranslate, setCopiedTranslate] = useState<boolean>(false);

  // --- MICRO EDITOR ACCUMULATORE (Per raccogliere volta per volta le traduzioni) ---
  const [editorText, setEditorText] = useState<string>(() => {
    try {
      return localStorage.getItem('micro_editor_content') || '';
    } catch {
      return '';
    }
  });
  const [copiedEditor, setCopiedEditor] = useState<boolean>(false);
  const [editorNotification, setEditorNotification] = useState<string | null>(null);

  // Initialize PDF.js worker
  useEffect(() => {
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
  }, []);

  // Save editor changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('micro_editor_content', editorText);
    } catch (e) {
      console.warn('Impossibile salvare su localStorage', e);
    }
  }, [editorText]);

  // Trigger temporary toast alert
  const triggerAlert = (msg: string) => {
    setAlertMessage(msg);
    setShowAlert(true);
    setTimeout(() => {
      setShowAlert(false);
    }, 2500);
  };

  // Render a specific PDF page
  const renderPage = async (pageNumber: number, doc = pdfDoc) => {
    if (!doc || !canvasRef.current) return;

    try {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore cancellation exception
        }
      }

      const page = await doc.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      canvas.width = viewport.width;
      canvas.height = viewport.height;

      // Extract text content of current page
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      setCurrentPageText(pageText);

      const renderContext = {
        canvasContext: ctx,
        viewport: viewport,
      };

      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;
      await renderTask.promise;

      setCurrentPage(pageNumber);
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.error('Errore rendering pagina:', err);
      }
    }
  };

  // Extract all text from all pages
  const extractAllText = async (doc: any, total: number) => {
    let fullText = '';
    for (let i = 1; i <= total; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items.map((item: any) => item.str).join(' ');
        fullText += `\n--- PAGINA ${i} ---\n${text}\n`;
      } catch (err) {
        console.error(`Errore estrazione pagina ${i}:`, err);
      }
    }
    setAllExtractedText(fullText);
  };

  // Load PDF file
  const handleFile = async (file: File) => {
    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      alert('Per favore seleziona un file PDF valido.');
      return;
    }

    setIsLoadingPdf(true);
    setPdfError(null);

    try {
      if (!window.pdfjsLib) {
        throw new Error('Libreria PDF.js non ancora pronta. Riprova tra un istante.');
      }
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
      const loadedDoc = await loadingTask.promise;

      setPdfDoc(loadedDoc);
      setTotalPages(loadedDoc.numPages);
      setCurrentPage(1);

      await extractAllText(loadedDoc, loadedDoc.numPages);
      await renderPage(1, loadedDoc);
    } catch (error: any) {
      console.error(error);
      setPdfError(error.message || 'Errore durante il caricamento del PDF');
    } finally {
      setIsLoadingPdf(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      renderPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      renderPage(currentPage + 1);
    }
  };

  const handleCopyPdfText = async () => {
    if (!allExtractedText) return;
    try {
      await navigator.clipboard.writeText(allExtractedText);
      triggerAlert('✅ Testo completo del PDF copiato!');
    } catch (e) {
      triggerAlert('❌ Errore copia appunti');
    }
  };

  const handleCopyCurrentPageText = async () => {
    if (!currentPageText) return;
    try {
      await navigator.clipboard.writeText(currentPageText);
      triggerAlert(`✅ Testo pagina ${currentPage} copiato!`);
    } catch (e) {
      triggerAlert('❌ Errore copia appunti');
    }
  };

  // Send current page text or full text to translator directly
  const sendToTranslator = (text: string, label: string) => {
    setInputText(text);
    // Smooth scroll to translator
    const translatorElem = document.getElementById('translator-section');
    if (translatorElem) {
      translatorElem.scrollIntoView({ behavior: 'smooth' });
    }
    triggerAlert(`📥 ${label} inserito nel traduttore!`);
  };

  // =========================================================================
  // LOGICA TRADUTTORE POTENZIATO PER TESTI LUNGHI E PARAGRAFI MULTIPLI
  // =========================================================================

  // Suddivide un testo lungo in blocchi intelligenti preservando frasi e paragrafi
  const splitTextIntoChunks = (text: string, maxChunkSize = 1400): string[] => {
    if (!text || text.length <= maxChunkSize) return [text];

    const chunks: string[] = [];
    const paragraphs = text.split('\n');
    let currentChunk = '';

    for (const para of paragraphs) {
      if ((currentChunk + '\n' + para).length <= maxChunkSize) {
        currentChunk = currentChunk ? currentChunk + '\n' + para : para;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }

        // Se un singolo paragrafo è più lungo di maxChunkSize, suddividilo per frasi
        if (para.length > maxChunkSize) {
          const sentences = para.match(/[^.!?]+[.!?]+|\S+/g) || [para];
          for (const sentence of sentences) {
            if ((currentChunk + ' ' + sentence).length <= maxChunkSize) {
              currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
            } else {
              if (currentChunk) chunks.push(currentChunk);
              currentChunk = sentence;
            }
          }
        } else {
          currentChunk = para;
        }
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk);
    }

    return chunks.length > 0 ? chunks : [text];
  };

  // Traduce un singolo frammento estraendo TUTTE le frasi restituite da Google
  const translateSingleChunk = async (
    chunk: string,
    source: string,
    target: string
  ): Promise<string> => {
    if (!chunk.trim()) return '';

    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(
      chunk
    )}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Errore HTTP ${response.status}`);
    }

    const data = await response.json();

    // Google Translate restituisce un array in data[0] contenente coppie [frase_tradotta, frase_originale]
    // Ricostruiamo interamente TUTTO il testo tradotto concatenando ogni segmento!
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translatedPieces = data[0]
        .map((segment: any) => (segment && segment[0] ? segment[0] : ''))
        .filter((part: string) => typeof part === 'string');

      return translatedPieces.join('');
    }

    throw new Error('Formato risposta non riconosciuto');
  };

  // Traduzione completa con supporto a qualsiasi lunghezza
  const handleTranslate = async () => {
    const textToTranslate = inputText.trim();
    if (!textToTranslate) {
      setOutputText('⚠️ Inserisci del testo da tradurre.');
      return;
    }

    setIsTranslating(true);
    setTranslateProgress(0);
    setTranslateStatus('Analisi del testo...');
    setOutputText('⏳ Traduzione in corso...');

    try {
      const chunks = splitTextIntoChunks(textToTranslate, 1400);
      const totalChunks = chunks.length;
      const translatedParts: string[] = [];

      for (let i = 0; i < totalChunks; i++) {
        setTranslateStatus(`Traduzione blocco ${i + 1} di ${totalChunks}...`);
        setTranslateProgress(Math.round(((i + 0.3) / totalChunks) * 100));

        const translatedChunk = await translateSingleChunk(
          chunks[i],
          sourceLang,
          targetLang
        );
        translatedParts.push(translatedChunk);

        setTranslateProgress(Math.round(((i + 1) / totalChunks) * 100));

        // Piccolo delay anti-throttling per testi enormi con molti blocchi
        if (totalChunks > 1 && i < totalChunks - 1) {
          await new Promise((resolve) => setTimeout(resolve, 80));
        }
      }

      const fullResult = translatedParts.join('\n\n');
      setOutputText(fullResult);
      setTranslateStatus('✅ Traduzione completata con successo!');
    } catch (err: any) {
      console.error('Errore traduzione:', err);
      setOutputText(
        `❌ Errore durante la traduzione: ${err.message || 'Controlla la connessione'}`
      );
      setTranslateStatus('❌ Si è verificato un errore.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Copia output traduzione
  const handleCopyOutput = async () => {
    if (!outputText || outputText.startsWith('⏳') || outputText.startsWith('❌')) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopiedTranslate(true);
      triggerAlert('📋 Testo tradotto copiato!');
      setTimeout(() => setCopiedTranslate(false), 2000);
    } catch (err) {
      triggerAlert('❌ Errore copia appunti');
    }
  };

  // Inverte le lingue sorgente e destinazione
  const handleSwapLanguages = () => {
    if (sourceLang === 'auto') {
      setSourceLang(targetLang);
      setTargetLang('it');
    } else {
      const temp = sourceLang;
      setSourceLang(targetLang);
      setTargetLang(temp);
    }
  };

  // --- FUNZIONI MICRO EDITOR ACCUMULATORE ---
  const handleAddToEditor = (content: string, titlePrefix = '') => {
    if (!content || content.startsWith('⏳') || content.startsWith('❌')) {
      triggerAlert('⚠️ Nessun testo valido da aggiungere.');
      return;
    }

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const header = titlePrefix ? `\n--- [${titlePrefix} - ${timestamp}] ---\n` : '\n\n';
    
    setEditorText((prev) => {
      if (!prev.trim()) {
        return titlePrefix ? `[${titlePrefix} - ${timestamp}]\n${content.trim()}` : content.trim();
      }
      return prev.trim() + header + content.trim();
    });

    setEditorNotification('Aggiunto al Micro Editor!');
    setTimeout(() => setEditorNotification(null), 2000);
    triggerAlert('📝 Aggiunto al Micro Editor!');
  };

  const handleCopyAllEditor = async () => {
    if (!editorText.trim()) return;
    try {
      await navigator.clipboard.writeText(editorText);
      setCopiedEditor(true);
      triggerAlert('📋 Contenuto del Micro Editor copiato!');
      setTimeout(() => setCopiedEditor(false), 2000);
    } catch (e) {
      triggerAlert('❌ Errore copia');
    }
  };

  const handleClearEditor = () => {
    if (window.confirm('Vuoi davvero cancellare tutto il testo nel Micro Editor?')) {
      setEditorText('');
      triggerAlert('🗑️ Micro Editor svuotato');
    }
  };

  const handleDownloadEditorText = () => {
    if (!editorText.trim()) return;
    const blob = new Blob([editorText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `traduzioni_${new Date().toISOString().slice(0, 10)}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    triggerAlert('💾 File scaricato!');
  };

  const hasDoc = pdfDoc !== null;

  return (
    <div
      id="app-root"
      style={{
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        minHeight: '100vh',
        padding: '2rem 1rem',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* ========================================================= */}
        {/* SEZIONE 1: VISUALIZZATORE PDF (Fedele al layout e grafica) */}
        {/* ========================================================= */}
        <div
          id="pdf-container"
          style={{
            background: 'white',
            borderRadius: '20px',
            boxShadow: '0 25px 50px rgba(0,0,0,0.15)',
            overflow: 'hidden',
            marginBottom: '3rem',
          }}
        >
          {/* Header */}
          <div
            id="pdf-header"
            style={{
              background: 'linear-gradient(135deg, #10b981, #059669)',
              color: 'white',
              padding: '2rem',
              textAlign: 'center',
              fontSize: '2.2rem',
              fontWeight: 800,
              letterSpacing: '-0.02em',
            }}
          >
            📄 Visualizzatore PDF PRO
          </div>

          {/* Area selezione file con drag & drop */}
          <div
            id="file-drop-zone"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleFile(file);
            }}
            style={{
              padding: '2.5rem 1.5rem',
              border: isDragOver ? '3px dashed #10b981' : '3px dashed #d1d5db',
              background: isDragOver ? '#ecfdf5' : '#ffffff',
              borderRadius: '16px',
              textAlign: 'center',
              margin: '2rem',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
            }}
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf"
              style={{ display: 'none' }}
              onChange={handleFileInputChange}
            />
            <div
              style={{
                fontSize: '1.3rem',
                fontWeight: 700,
                color: '#374151',
                marginBottom: '0.25rem',
              }}
            >
              🔽 Clicca qui o trascina un PDF
            </div>
            <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
              Carica file PDF per visualizzare e leggere ogni pagina
            </div>
          </div>

          {/* Toolbar comandi */}
          <div
            id="pdf-toolbar"
            style={{
              display: 'flex',
              gap: '0.75rem',
              padding: '1.25rem 2rem',
              background: '#f8fafc',
              flexWrap: 'wrap',
              alignItems: 'center',
              borderBottom: '1px solid #e2e8f0',
            }}
          >
            <button
              id="copy-pdf-btn"
              disabled={!hasDoc || !allExtractedText}
              onClick={handleCopyPdfText}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: 'white',
                padding: '0.75rem 1.5rem',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: !hasDoc || !allExtractedText ? 'not-allowed' : 'pointer',
                opacity: !hasDoc || !allExtractedText ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 5px 15px rgba(16,185,129,0.4)',
                transition: 'all 0.2s',
              }}
            >
              <svg
                style={{ width: '20px', height: '20px', fill: 'currentColor' }}
                viewBox="0 0 24 24"
              >
                <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z" />
              </svg>
              COPIA TESTO
            </button>

            <button
              id="pdf-prev-btn"
              disabled={!hasDoc || currentPage <= 1}
              onClick={handlePrevPage}
              style={{
                background: '#6b7280',
                color: 'white',
                padding: '0.75rem 1.25rem',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: !hasDoc || currentPage <= 1 ? 'not-allowed' : 'pointer',
                opacity: !hasDoc || currentPage <= 1 ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              ◀️ PREC
            </button>

            <span
              id="pdf-page-info"
              style={{
                padding: '0.75rem 1.25rem',
                background: '#e5e7eb',
                borderRadius: '10px',
                fontWeight: 700,
                color: '#1f2937',
              }}
            >
              {hasDoc ? `Pagina ${currentPage} di ${totalPages}` : 'Carica PDF'}
            </span>

            <button
              id="pdf-next-btn"
              disabled={!hasDoc || currentPage >= totalPages}
              onClick={handleNextPage}
              style={{
                background: '#6b7280',
                color: 'white',
                padding: '0.75rem 1.25rem',
                border: 'none',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: !hasDoc || currentPage >= totalPages ? 'not-allowed' : 'pointer',
                opacity: !hasDoc || currentPage >= totalPages ? 0.5 : 1,
                transition: 'all 0.2s',
              }}
            >
              SUCC ➡️
            </button>

            {/* Pulsanti rapidi per passare il testo al traduttore */}
            {hasDoc && currentPageText.trim() && (
              <button
                id="send-page-to-translator-btn"
                onClick={() =>
                  sendToTranslator(currentPageText, `Pagina ${currentPage}`)
                }
                style={{
                  background: '#3b82f6',
                  color: 'white',
                  padding: '0.75rem 1.25rem',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  marginLeft: 'auto',
                  boxShadow: '0 4px 12px rgba(59,130,246,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                🔄 Invia Pag. {currentPage} al Traduttore
              </button>
            )}
          </div>

          {/* Area visualizzazione canvas e testo */}
          <div
            id="pdf-display-area"
            style={{
              minHeight: '400px',
              padding: '2rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1.5rem',
              background: '#fafafa',
            }}
          >
            {isLoadingPdf && (
              <div style={{ color: '#059669', fontSize: '1.2rem', fontWeight: 600, padding: '3rem' }}>
                ⏳ Caricamento ed elaborazione PDF in corso...
              </div>
            )}

            {pdfError && (
              <div style={{ color: '#ef4444', fontSize: '1.1rem', fontWeight: 600, padding: '2rem' }}>
                ❌ Errore: {pdfError}
              </div>
            )}

            {!hasDoc && !isLoadingPdf && !pdfError && (
              <div
                style={{
                  color: '#9ca3af',
                  fontSize: '1.2rem',
                  textAlign: 'center',
                  padding: '3rem',
                }}
              >
                Carica un PDF per vedere magia...
              </div>
            )}

            {/* Canvas per il rendering PDF */}
            <canvas
              ref={canvasRef}
              style={{
                display: hasDoc && !isLoadingPdf ? 'block' : 'none',
                maxWidth: '100%',
                boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
                borderRadius: '12px',
                backgroundColor: '#ffffff',
              }}
            />

            {/* Testo estratto dalla pagina */}
            {hasDoc && !isLoadingPdf && currentPageText.trim() && (
              <div style={{ width: '100%', maxWidth: '850px' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '0.5rem',
                  }}
                >
                  <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4b5563' }}>
                    📝 Testo estratto (Pagina {currentPage}):
                  </span>
                  <button
                    onClick={handleCopyCurrentPageText}
                    style={{
                      background: '#e2e8f0',
                      border: 'none',
                      padding: '0.35rem 0.75rem',
                      borderRadius: '6px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      color: '#334155',
                    }}
                  >
                    📋 Copia solo questa pagina
                  </button>
                </div>
                <div
                  id="extracted-page-text"
                  style={{
                    width: '100%',
                    padding: '1.25rem',
                    background: '#f1f5f9',
                    border: '2px solid #e2e8f0',
                    borderRadius: '12px',
                    fontSize: '14px',
                    lineHeight: '1.6',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.04)',
                    boxSizing: 'border-box',
                    color: '#1e293b',
                  }}
                >
                  {currentPageText}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SEZIONE 2: TRADUTTORE POTENZIATO (Migliorato per testi lunghi) */}
        {/* ========================================================= */}
        <div
          id="translator-section"
          style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            marginBottom: '3rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1.25rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 800,
                color: '#1e293b',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              🗣️ Traduttore Potenziato
            </h1>
            <div
              style={{
                fontSize: '0.85rem',
                background: '#dcfce7',
                color: '#166534',
                padding: '0.35rem 0.75rem',
                borderRadius: '20px',
                fontWeight: 700,
              }}
            >
              ⚡ Supporta testi e paragrafi lunghi illimitati
            </div>
          </div>

          {/* Testo in input */}
          <div style={{ position: 'relative', marginBottom: '1rem' }}>
            <textarea
              id="inputText"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Inserisci o incolla qui il testo (puoi incollare anche intere pagine o lunghi documenti)..."
              style={{
                width: '100%',
                minHeight: '130px',
                padding: '15px',
                border: '2px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '15px',
                lineHeight: '1.5',
                resize: 'vertical',
                boxSizing: 'border-box',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.8rem',
                color: '#64748b',
                marginTop: '4px',
                padding: '0 4px',
              }}
            >
              <span>Caratteri: {inputText.length} | Parole: {inputText.trim() ? inputText.trim().split(/\s+/).length : 0}</span>
              {inputText && (
                <button
                  onClick={() => setInputText('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#ef4444',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                  }}
                >
                  ✕ Cancella testo
                </button>
              )}
            </div>
          </div>

          {/* Barra controlli lingua e azioni */}
          <div
            id="translator-controls"
            style={{
              display: 'flex',
              gap: '10px',
              margin: '15px 0',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {/* Lingua sorgente */}
            <select
              id="sourceLang"
              value={sourceLang}
              onChange={(e) => setSourceLang(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '2px solid #cbd5e1',
                fontSize: '15px',
                fontWeight: 600,
                background: '#f8fafc',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="auto">🌐 Rileva lingua</option>
              <option value="it">🇮🇹 Italiano</option>
              <option value="zh-CN">🇨🇳 Cinese</option>
              <option value="ja">🇯🇵 Giapponese</option>
              <option value="ko">🇰🇷 Coreano</option>
              <option value="en">🇬🇧 Inglese</option>
              <option value="es">🇪🇸 Spagnolo</option>
              <option value="fr">🇫🇷 Francese</option>
              <option value="de">🇩🇪 Tedesco</option>
              <option value="pt">🇵🇹 Portoghese</option>
              <option value="ru">🇷🇺 Russo</option>
              <option value="ar">🇸🇦 Arabo</option>
            </select>

            {/* Tasto inverti lingue */}
            <button
              onClick={handleSwapLanguages}
              title="Inverti lingue"
              style={{
                background: '#e2e8f0',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 12px',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '16px',
              }}
            >
              ⇄
            </button>

            {/* Lingua destinazione */}
            <select
              id="targetLang"
              value={targetLang}
              onChange={(e) => setTargetLang(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '2px solid #cbd5e1',
                fontSize: '15px',
                fontWeight: 600,
                background: '#f8fafc',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="it">🇮🇹 Italiano</option>
              <option value="en">🇬🇧 Inglese</option>
              <option value="zh-CN">🇨🇳 Cinese</option>
              <option value="ja">🇯🇵 Giapponese</option>
              <option value="ko">🇰🇷 Coreano</option>
              <option value="es">🇪🇸 Spagnolo</option>
              <option value="fr">🇫🇷 Francese</option>
              <option value="de">🇩🇪 Tedesco</option>
              <option value="pt">🇵🇹 Portoghese</option>
              <option value="ru">🇷🇺 Russo</option>
              <option value="ar">🇸🇦 Arabo</option>
            </select>

            {/* Pulsante Traduci */}
            <button
              id="translate-action-btn"
              disabled={isTranslating || !inputText.trim()}
              onClick={handleTranslate}
              style={{
                background: isTranslating ? '#6ee7b7' : '#28a745',
                color: 'white',
                border: 'none',
                padding: '12px 24px',
                borderRadius: '8px',
                fontSize: '16px',
                cursor: isTranslating || !inputText.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 700,
                transition: 'all 0.2s',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                boxShadow: '0 4px 10px rgba(40,167,69,0.3)',
              }}
            >
              {isTranslating ? '⏳ Traduzione...' : '🔄 Traduci'}
            </button>

            {/* Pulsante Copia traduzione */}
            <button
              id="copy-translate-btn"
              disabled={!outputText || outputText.startsWith('⏳') || outputText.startsWith('❌')}
              onClick={handleCopyOutput}
              style={{
                background: copiedTranslate ? '#28a745' : '#17a2b8',
                color: 'white',
                border: 'none',
                padding: '12px 18px',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: !outputText || outputText.startsWith('⏳') || outputText.startsWith('❌') ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s',
                opacity: !outputText || outputText.startsWith('⏳') ? 0.6 : 1,
              }}
            >
              {copiedTranslate ? '✅ Copiato!' : '📋 Copia'}
            </button>

            {/* Pulsante Invia a Micro Editor */}
            <button
              id="add-to-microeditor-btn"
              disabled={!outputText || outputText.startsWith('⏳') || outputText.startsWith('❌')}
              onClick={() => handleAddToEditor(outputText, `Traduzione ${sourceLang} ➔ ${targetLang}`)}
              style={{
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                padding: '12px 18px',
                borderRadius: '8px',
                fontSize: '14px',
                cursor: !outputText || outputText.startsWith('⏳') ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                transition: 'all 0.2s',
                opacity: !outputText || outputText.startsWith('⏳') ? 0.6 : 1,
                boxShadow: '0 4px 10px rgba(139,92,246,0.3)',
              }}
            >
              📥 Aggiungi a Micro Editor
            </button>
          </div>

          {/* Barra di avanzamento per traduzioni di testi lunghi */}
          {isTranslating && (
            <div style={{ margin: '10px 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#059669', marginBottom: '4px', fontWeight: 600 }}>
                <span>{translateStatus}</span>
                <span>{translateProgress}%</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${translateProgress}%`,
                    height: '100%',
                    background: 'linear-gradient(90deg, #10b981, #059669)',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>
            </div>
          )}

          {/* Area output del testo tradotto */}
          <div style={{ position: 'relative', marginTop: '1rem' }}>
            <textarea
              id="outputText"
              value={outputText}
              readOnly
              placeholder="Il risultato della traduzione completa apparirà qui..."
              style={{
                width: '100%',
                minHeight: '140px',
                padding: '15px',
                border: '2px solid #e2e8f0',
                borderRadius: '10px',
                fontSize: '15px',
                lineHeight: '1.6',
                resize: 'vertical',
                boxSizing: 'border-box',
                background: '#f8fafc',
                color: outputText.startsWith('❌') ? '#ef4444' : '#1e293b',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
            {outputText && !outputText.startsWith('⏳') && (
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#64748b',
                  marginTop: '4px',
                  padding: '0 4px',
                }}
              >
                Caratteri tradotti: {outputText.length} | Parole: {outputText.trim().split(/\s+/).length}
              </div>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SEZIONE 3: MICRO EDITOR (Raccogli e accumula traduzioni) */}
        {/* ========================================================= */}
        <div
          id="micro-editor-section"
          style={{
            background: 'white',
            borderRadius: '16px',
            padding: '30px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            marginBottom: '3rem',
            border: '2px solid #e0e7ff',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '1rem',
              flexWrap: 'wrap',
              gap: '0.75rem',
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 800,
                  color: '#4338ca',
                  margin: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                📝 Micro Editor & Blocco Note
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.88rem', color: '#64748b' }}>
                Accumula e organizza volta per volta i testi tradotti del tuo documento.
              </p>
            </div>

            {/* Barra azioni Micro Editor */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                id="copy-editor-btn"
                disabled={!editorText.trim()}
                onClick={handleCopyAllEditor}
                style={{
                  background: copiedEditor ? '#10b981' : '#4f46e5',
                  color: 'white',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: !editorText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !editorText.trim() ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.2s',
                }}
              >
                {copiedEditor ? '✅ Copiato!' : '📋 Copia tutto'}
              </button>

              <button
                id="insert-divider-btn"
                onClick={() => {
                  setEditorText((prev) => prev + '\n\n----------------------------------------\n\n');
                  triggerAlert('➖ Separatore inserito');
                }}
                style={{
                  background: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                ➕ Separatore
              </button>

              <button
                id="download-editor-btn"
                disabled={!editorText.trim()}
                onClick={handleDownloadEditorText}
                style={{
                  background: '#0284c7',
                  color: 'white',
                  border: 'none',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: !editorText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !editorText.trim() ? 0.5 : 1,
                }}
              >
                💾 Scarica .txt
              </button>

              <button
                id="clear-editor-btn"
                disabled={!editorText.trim()}
                onClick={handleClearEditor}
                style={{
                  background: '#fee2e2',
                  color: '#b91c1c',
                  border: '1px solid #fca5a5',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: !editorText.trim() ? 'not-allowed' : 'pointer',
                  opacity: !editorText.trim() ? 0.5 : 1,
                }}
              >
                🗑️ Svuota
              </button>
            </div>
          </div>

          {/* Area editor */}
          <textarea
            id="microEditorArea"
            value={editorText}
            onChange={(e) => setEditorText(e.target.value)}
            placeholder="Il Micro Editor raccoglierà qui le traduzioni che aggiungi con il pulsante '📥 Aggiungi a Micro Editor' o che scrivi direttamente. Il testo viene salvato automaticamente."
            style={{
              width: '100%',
              minHeight: '200px',
              padding: '16px',
              border: '2px solid #c7d2fe',
              borderRadius: '10px',
              fontSize: '15px',
              lineHeight: '1.6',
              resize: 'vertical',
              boxSizing: 'border-box',
              background: '#ffffff',
              color: '#1e293b',
              fontFamily: 'inherit',
              outline: 'none',
            }}
          />

          {/* Info statistiche editor */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '6px',
              fontSize: '0.82rem',
              color: '#6366f1',
              fontWeight: 600,
            }}
          >
            <span>
              Caratteri accumulati: {editorText.length} | Parole:{' '}
              {editorText.trim() ? editorText.trim().split(/\s+/).length : 0} | Righe:{' '}
              {editorText ? editorText.split('\n').length : 0}
            </span>
            <span style={{ color: '#16a34a' }}>● Salvataggio automatico attivo</span>
          </div>
        </div>
      </div>

      {/* Floating Notification Toast */}
      <div
        id="alert-toast"
        style={{
          position: 'fixed',
          bottom: '2rem',
          left: '50%',
          transform: showAlert
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(120px)',
          background: '#10b981',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '12px',
          fontWeight: 700,
          boxShadow: '0 15px 35px rgba(0,0,0,0.25)',
          transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          zIndex: 9999,
          pointerEvents: 'none',
        }}
      >
        {alertMessage}
      </div>
    </div>
  );
}
