import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { toast } from 'sonner'

/**
 * Format paise integer into clean currency string for PDF (ASCII compatible to prevent font glyph glitches)
 */
const formatPaisePDF = (paise) => {
  const n = Number(paise || 0) / 100
  if (n === 0) return '0.00'
  const sign = n < 0 ? '-' : ''
  return sign + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Export Master Register to Excel (.xlsx)
 */
export function exportRegisterExcel({ centre, from, to, rows }) {
  if (!rows || rows.length === 0) {
    toast.error('No data available to export')
    return
  }

  try {
    const centreName = centre?.name || 'All Centres'
    const exportedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

    const sheetData = [
      ['MOROCCAN SPA — MASTER REGISTER'],
      [`Centre: ${centreName}`, `Date Range: ${from} to ${to}`, `Exported: ${exportedAt}`],
      [], // Blank separator row
      [
        'Date',
        'Opening Cash (INR)',
        'Booking Sales (INR)',
        'Membership Sales (INR)',
        'Gift Card Sales (INR)',
        'Cash Sales (INR)',
        'UPI Sales (INR)',
        'Card Sales (INR)',
        'Expenses (INR)',
        'Cash Deposited (INR)',
        'Cash Withdrawn (INR)',
        'Expected Closing Cash (INR)',
        'Guests',
        'Status'
      ]
    ]

    let totBooking = 0, totMemb = 0, totGC = 0, totCash = 0, totUPI = 0, totCard = 0, totExp = 0, totDep = 0, totWith = 0, totGuests = 0

    rows.forEach(r => {
      const upiSales = (r.upi_1_sales || 0) + (r.upi_2_sales || 0)
      totBooking += (r.booking_sales || 0)
      totMemb += (r.membership_sales || 0)
      totGC += (r.gift_card_sales || 0)
      totCash += (r.cash_sales || 0)
      totUPI += upiSales
      totCard += (r.card_sales || 0)
      totExp += (r.total_expenses || 0)
      totDep += (r.cash_deposited || 0)
      totWith += (r.cash_withdrawn || 0)
      totGuests += (r.guests || 0)

      sheetData.push([
        r.business_date,
        (r.opening_cash || 0) / 100,
        (r.booking_sales || 0) / 100,
        (r.membership_sales || 0) / 100,
        (r.gift_card_sales || 0) / 100,
        (r.cash_sales || 0) / 100,
        upiSales / 100,
        (r.card_sales || 0) / 100,
        (r.total_expenses || 0) / 100,
        (r.cash_deposited || 0) / 100,
        (r.cash_withdrawn || 0) / 100,
        (r.closing_cash_expected || 0) / 100,
        r.guests || 0,
        r.status
      ])
    })

    // Total Row
    sheetData.push([
      'TOTAL',
      '',
      totBooking / 100,
      totMemb / 100,
      totGC / 100,
      totCash / 100,
      totUPI / 100,
      totCard / 100,
      totExp / 100,
      totDep / 100,
      totWith / 100,
      '',
      totGuests,
      ''
    ])

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(sheetData)

    // Set auto-fit column widths
    ws['!cols'] = [
      { wch: 14 }, // Date
      { wch: 18 }, // Opening
      { wch: 18 }, // Booking
      { wch: 20 }, // Memb
      { wch: 18 }, // GC
      { wch: 16 }, // Cash
      { wch: 16 }, // UPI
      { wch: 16 }, // Card
      { wch: 16 }, // Expenses
      { wch: 20 }, // Deposited
      { wch: 20 }, // Withdrawn
      { wch: 22 }, // Closing
      { wch: 10 }, // Guests
      { wch: 12 }  // Status
    ]

    XLSX.utils.book_append_sheet(wb, ws, 'Master Register')
    const cleanName = (centreName || 'All_Centres').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Master_Register_${cleanName}_${from}_to_${to}.xlsx`
    XLSX.writeFile(wb, fileName)

    toast.success(`Master Register exported as Excel: ${fileName}`)
  } catch (err) {
    console.error('Excel Export Error:', err)
    toast.error('Failed to export Excel file')
  }
}

/**
 * Export Master Register to PDF (.pdf) with pixel-perfect spacing and formatting
 */
export function exportRegisterPDF({ centre, from, to, rows }) {
  if (!rows || rows.length === 0) {
    toast.error('No data available to export')
    return
  }

  try {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const centreName = centre?.name || 'All Centres'
    const exportedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

    // Header Banner (Dark Slate #0F172A)
    doc.setFillColor(15, 23, 42)
    doc.rect(0, 0, 297, 24, 'F')

    // Gold Accent Stripe (#D97706)
    doc.setFillColor(217, 119, 6)
    doc.rect(0, 24, 297, 1.5, 'F')

    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('MOROCCAN SPA — MASTER REGISTER', 12, 11)

    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(226, 232, 240)
    doc.text(`Centre: ${centreName}   |   Period: ${from} to ${to}   |   Generated: ${exportedAt}`, 12, 18)

    const headers = [
      [
        'Date',
        'Opening (₹)',
        'Booking (₹)',
        'Memb (₹)',
        'GC (₹)',
        'Cash (₹)',
        'UPI (₹)',
        'Card (₹)',
        'Expense (₹)',
        'Deposit (₹)',
        'Withdraw (₹)',
        'Closing Exp (₹)',
        'Guests',
        'Status'
      ]
    ]

    let totBooking = 0, totMemb = 0, totGC = 0, totCash = 0, totUPI = 0, totCard = 0, totExp = 0, totDep = 0, totWith = 0, totGuests = 0

    const bodyData = rows.map(r => {
      const upiSales = (r.upi_1_sales || 0) + (r.upi_2_sales || 0)
      totBooking += (r.booking_sales || 0)
      totMemb += (r.membership_sales || 0)
      totGC += (r.gift_card_sales || 0)
      totCash += (r.cash_sales || 0)
      totUPI += upiSales
      totCard += (r.card_sales || 0)
      totExp += (r.total_expenses || 0)
      totDep += (r.cash_deposited || 0)
      totWith += (r.cash_withdrawn || 0)
      totGuests += (r.guests || 0)

      return [
        r.business_date,
        formatPaisePDF(r.opening_cash),
        formatPaisePDF(r.booking_sales),
        formatPaisePDF(r.membership_sales),
        formatPaisePDF(r.gift_card_sales),
        formatPaisePDF(r.cash_sales),
        formatPaisePDF(upiSales),
        formatPaisePDF(r.card_sales),
        formatPaisePDF(r.total_expenses),
        formatPaisePDF(r.cash_deposited),
        formatPaisePDF(r.cash_withdrawn),
        formatPaisePDF(r.closing_cash_expected),
        r.guests || 0,
        r.status
      ]
    })

    // Add Summary Row
    bodyData.push([
      'TOTAL',
      '—',
      formatPaisePDF(totBooking),
      formatPaisePDF(totMemb),
      formatPaisePDF(totGC),
      formatPaisePDF(totCash),
      formatPaisePDF(totUPI),
      formatPaisePDF(totCard),
      formatPaisePDF(totExp),
      formatPaisePDF(totDep),
      formatPaisePDF(totWith),
      '—',
      totGuests,
      ''
    ])

    autoTable(doc, {
      startY: 28,
      margin: { top: 28, left: 10, right: 10, bottom: 12 },
      head: headers,
      body: bodyData,
      theme: 'grid',
      styles: {
        fontSize: 6.8,
        cellPadding: { top: 3.5, bottom: 3.5, left: 1.5, right: 1.5 },
        minCellHeight: 8.5,
        valign: 'middle',
        font: 'helvetica',
        textColor: [30, 41, 59],
        overflow: 'linebreak'
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 7.2,
        halign: 'center',
        valign: 'middle',
        cellPadding: { top: 4, bottom: 4, left: 1, right: 1 }
      },
      columnStyles: {
        0:  { halign: 'left',   fontStyle: 'bold', cellWidth: 20 },
        1:  { halign: 'right',  cellWidth: 20 },
        2:  { halign: 'right',  cellWidth: 20 },
        3:  { halign: 'right',  cellWidth: 19 },
        4:  { halign: 'right',  cellWidth: 18 },
        5:  { halign: 'right',  cellWidth: 20 },
        6:  { halign: 'right',  cellWidth: 20 },
        7:  { halign: 'right',  cellWidth: 20 },
        8:  { halign: 'right',  textColor: [225, 29, 72], cellWidth: 19 },
        9:  { halign: 'right',  cellWidth: 19 },
        10: { halign: 'right',  cellWidth: 19 },
        11: { halign: 'right',  fontStyle: 'bold', cellWidth: 22 },
        12: { halign: 'center', cellWidth: 14 },
        13: { halign: 'center', cellWidth: 17 }
      },
      didParseCell: (data) => {
        if (data.row.index === bodyData.length - 1) {
          data.cell.styles.fontStyle = 'bold'
          data.cell.styles.fillColor = [241, 245, 249]
          data.cell.styles.textColor = [15, 23, 42]
          data.cell.styles.minCellHeight = 9.5
        }
      },
      didDrawPage: (data) => {
        const pageCount = doc.internal.getNumberOfPages()
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text(`Page ${pageCount}`, 297 - 14, 205, { align: 'right' })
      }
    })

    const cleanName = (centreName || 'All_Centres').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `Master_Register_${cleanName}_${from}_to_${to}.pdf`
    doc.save(fileName)

    toast.success(`Master Register exported as PDF: ${fileName}`)
  } catch (err) {
    console.error('PDF Export Error:', err)
    toast.error('Failed to export PDF file')
  }
}
