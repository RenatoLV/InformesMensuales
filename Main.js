/**
 * CONFIGURACIÓN GLOBAL
 * Centraliza IDs y constantes para fácil mantenimiento.
 */
const CONFIG = {
  ID_SPREADSHEET: '1SRc7Ky9Nki2lppPoA43rEhnQ7_iNvNs2nAUODxRfk18', 
  ID_PLANTILLA: '1oFZAitbjtPMGN-PO53OHHKYoN3hPe3qK-4PJdDlFVnU',
  
  // CARPETAS DRIVE
  ID_FOLDER_REMU: '1sYoa2pKtHw0CNsri0k08ddmAhGnKw4aN',         // Archivos firmados (Finales)
  ID_FOLDER_PDFS_GENERADOS: '1WuBMnFbVUMucCou5WCB-B9X12ViFhsTS', // Temporales Generados
  ID_FOLDER_TRANSPARENCIA: '1gVceuQxXNqiCKiaNi04JbIZ1poi75o8O', // Censurados
  ID_FOLDER_DOCS: '1L6zukWYRavoqeSO3Sc-nzQVYPQIVBoiw',         // Docs Editables (Word)
  
  // NOMBRES DE HOJAS
  TAB_LOG: 'REGISTRO_HISTORICO',
  TAB_JEFATURA: 'JEFATURA',

  // ZONA HORARIA
  TIMEZONE: "GMT-3"
};

function doGet() {
  return HtmlService.createTemplateFromFile('Index')
      .evaluate()
      .setTitle('Gestión Informes - Muni Coquimbo')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL) // Permite incrustar si es necesario
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}