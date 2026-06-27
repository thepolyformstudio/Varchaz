/* ============================================================
   Varchaz — Export Service (PDF & Excel)
   ============================================================ */

import type { ExportOptions, ProductPerformance } from '../types';
import { formatIndianNumber, formatPercent } from '../utils/formatters';

/** Export data to Excel */
export async function exportToExcel(options: ExportOptions): Promise<void> {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.json_to_sheet(options.data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${options.fileName}.xlsx`);
}

/** Export data to PDF */
export async function exportToPDF(options: ExportOptions): Promise<void> {
  const { default: jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;

  const pdfDoc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  // Title
  pdfDoc.setFontSize(16);
  pdfDoc.setTextColor(15, 23, 42);
  pdfDoc.text(options.title, 14, 20);

  // Date
  pdfDoc.setFontSize(9);
  pdfDoc.setTextColor(100, 116, 139);
  pdfDoc.text(`Generated: ${new Date().toLocaleDateString('en-IN')}`, 14, 28);

  // Table
  const headers = options.columns.map(c => c.header);
  const rows = options.data.map(row => options.columns.map(c => row[c.key] ?? ''));

  autoTable(pdfDoc, {
    head: [headers],
    body: rows,
    startY: 34,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold'
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 14, right: 14 }
  });

  // Footer
  const pageCount = pdfDoc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    pdfDoc.setPage(i);
    pdfDoc.setFontSize(8);
    pdfDoc.setTextColor(148, 163, 184);
    pdfDoc.text(
      `Varchaz Report — Page ${i} of ${pageCount}`,
      pdfDoc.internal.pageSize.getWidth() / 2,
      pdfDoc.internal.pageSize.getHeight() - 8,
      { align: 'center' }
    );
  }

  pdfDoc.save(`${options.fileName}.pdf`);
}

/** Helper: Convert ProductPerformance array to export-ready data */
export function performanceToExportData(
  performances: ProductPerformance[],
  viewType: 'mtd' | 'ytd' | 'day'
): { data: any[]; columns: { header: string; key: string }[] } {
  const columns = [
    { header: 'Product', key: 'product' },
    ...(viewType !== 'day' ? [
      { header: 'Plan', key: 'plan' },
    ] : []),
    { header: 'Achievement', key: 'achievement' },
    ...(viewType !== 'day' ? [
      { header: 'Achievement %', key: 'pct' },
    ] : [])
  ];

  // Group by category
  const categoriesMap: Record<string, ProductPerformance[]> = {};
  performances.forEach(p => {
    const cat = p.category || 'General';
    if (!categoriesMap[cat]) {
      categoriesMap[cat] = [];
    }
    categoriesMap[cat].push(p);
  });

  const sortedCategories = Object.keys(categoriesMap).sort();
  const data: any[] = [];
  let grandTotalPlan = 0;
  let grandTotalAchievement = 0;

  sortedCategories.forEach(catName => {
    const catProducts = categoriesMap[catName];
    
    // Add Category Header Row
    data.push({
      product: `CATEGORY: ${catName.toUpperCase()}`,
      plan: '',
      achievement: '',
      pct: ''
    });

    let catPlan = 0;
    let catAchievement = 0;

    catProducts.forEach(p => {
      catPlan += p.plan;
      catAchievement += p.achievement;
      grandTotalPlan += p.plan;
      grandTotalAchievement += p.achievement;

      data.push({
        product: `  ${p.productName}`, // indented for visual hierarchy
        plan: p.hasNoPlan ? 'No Plan' : formatIndianNumber(p.plan),
        achievement: formatIndianNumber(p.achievement),
        pct: p.hasNoPlan && p.achievement === 0 ? '0%' : formatPercent(p.achievementPct)
      });
    });

    // Add Category Subtotal Row
    const catPct = catPlan > 0 ? (catAchievement / catPlan) * 100 : 0;
    data.push({
      product: `  Sub-total (${catName})`,
      plan: viewType !== 'day' ? formatIndianNumber(catPlan) : '',
      achievement: formatIndianNumber(catAchievement),
      pct: viewType !== 'day' ? formatPercent(catPct) : ''
    });
  });

  // Add Grand Total Row
  if (performances.length > 0) {
    const grandPct = grandTotalPlan > 0 ? (grandTotalAchievement / grandTotalPlan) * 100 : 0;
    data.push({
      product: 'GRAND TOTAL',
      plan: viewType !== 'day' ? formatIndianNumber(grandTotalPlan) : '',
      achievement: formatIndianNumber(grandTotalAchievement),
      pct: viewType !== 'day' ? formatPercent(grandPct) : ''
    });
  }

  return { data, columns };
}
