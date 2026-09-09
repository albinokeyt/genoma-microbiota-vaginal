# Independent molecular components

Use the checkboxes under "Componentes incluidos en el informe" to select
microbiota, fungi, VPH, or a combination. At least one must remain selected.
Excluded components must not appear as studied or negative. Toggling a component
must preserve its inputs for the current report.

Automated domain regression: `node tests/molecular-panels.test.cjs`.
Local PDF capture: `python tests/pdf_preview_server.py` (isolated qa/data).

Browser regression completed for all seven non-empty combinations:
- Microbiota: 4 quantitative rows and the existing complementary markers.
- Fungi: 14 rows, with No detectado / Detectado bajo / Detectado medio / Detectado alto.
- VPH: 28 input fields, unchanged reference groups and formulas.
- Header and patient identification remain present when microbiota is excluded.
- Section and page numbers are consecutive; no omitted component headings remain.
- A saved VPH settings change survives reload; legacy settings gain default VPH groups.

PDF checks at desktop and 390px mobile viewport:
- Complete example: 5 A4 pages.
- Fungi only: 2 A4 pages.
- VPH only, all 28 CT inputs populated: 5 A4 pages, all 28 rows preserved.
- Pixel checks and visual inspection confirm nonblank pages, readable tables,
  preserved logo proportions, and no overlapping footers.

The report body is fixed A4 on every viewport; export does not depend on the
phone's native print dialog. No clinical classification changes are introduced.
