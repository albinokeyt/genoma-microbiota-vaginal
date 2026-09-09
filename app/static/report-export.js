(function (root) {
  let busy = false;
  async function download(report, name) {
    if (busy) return;
    busy = true;
    const button = document.querySelector('[data-action="print"]');
    const label = button.textContent;
    const editor = document.getElementById("editorView");
    const topbar = document.querySelector(".topbar");
    button.disabled = true;
    button.textContent = "Generando PDF...";
    editor.inert = topbar.inert = true;
    try {
      await document.fonts.ready;
      await Promise.all([...report.querySelectorAll("img")].map(img => img.decode()));
      ReportLayout.paginate(report);
      if (report.dataset.layoutError) throw new Error(report.dataset.layoutError);
      await Promise.all([...report.querySelectorAll("img")].map(img => img.decode()));
      const pdf = new root.jspdf.jsPDF({ unit: "mm", format: "a4", compress: true });
      const pages = [...report.querySelectorAll(".report-page")];
      for (let index = 0; index < pages.length; index++) {
        const page = pages[index];
        const canvas = await root.html2canvas(page, {
          scale: 2, backgroundColor: "#ffffff", useCORS: true, logging: false,
          width: page.offsetWidth, height: page.offsetHeight, scrollX: 0, scrollY: 0,
          windowWidth: 1280, windowHeight: 1200,
          onclone: (doc, clonedPage) => {
            doc.querySelectorAll(".report-page").forEach(other => { if (other !== clonedPage) other.style.display = "none"; });
          },
        });
        if (index) pdf.addPage("a4", "portrait");
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.94), "JPEG", 0, 0, 210, 297, undefined, "FAST");
        canvas.width = canvas.height = 1;
      }
      pdf.save(name.replace(/[\\/:*?"<>|]/g, " ") + ".pdf");
    } catch (error) {
      alert("No se pudo generar el PDF: " + error.message);
    } finally {
      busy = false;
      editor.inert = topbar.inert = false;
      button.disabled = false;
      button.textContent = label;
    }
  }
  root.ReportExport = { download };
})(window);
