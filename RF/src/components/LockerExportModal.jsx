import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { saveAs } from 'file-saver'
import './LockerExportModal.css'

function LockerExportModal({ lockers, employees, onClose }) {
  const getEmployee = (employeeId) =>
    employees.find((employee) => employee.id === employeeId)

  const formatDays = (days = []) => {
    const abbreviations = {
      Sunday: 'Sun',
      Monday: 'Mon',
      Tuesday: 'Tue',
      Wednesday: 'Wed',
      Thursday: 'Thu',
      Friday: 'Fri',
      Saturday: 'Sat',
    }

    return days.map((day) => abbreviations[day] || day).join(', ')
  }

  const formatUsers = (employeeIds = []) => {
    if (employeeIds.length === 0) {
      return '—'
    }

    return employeeIds
      .map((employeeId) => {
        const employee = getEmployee(employeeId)

        if (!employee) {
          return 'Unknown employee'
        }

        return `${employee.name} (${formatDays(employee.days)})`
      })
      .join('; ')
  }

  const reservedLabel = (lockerNumber) => {
    const reservedLockers = {
      'DIS-14': 'Dispatch Supervisor',
      'DIS-15': 'Dispatch Supervisor',
      'DIS-16': 'Temp. Gun',
      'DIS-17': 'Reserved',
    }

    return reservedLockers[lockerNumber] || null
  }

  const exportRows = lockers.map((locker) => {
    const reserved = reservedLabel(locker.lockerNumber)

    return {
      lockerNumber: locker.lockerNumber,
      combination: locker.combination,
      dayUser: reserved || formatUsers(locker.dayEmployeeIds),
      nightUser: reserved || formatUsers(locker.nightEmployeeIds),
    }
  })

  const fileDate = new Date().toISOString().slice(0, 10)
  const fileBaseName = `locker-assignments-${fileDate}`

  const exportPdf = () => {
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    })

    pdf.setFillColor(16, 27, 45)
    pdf.rect(0, 0, 297, 210, 'F')

    pdf.setTextColor(77, 217, 255)
    pdf.setFontSize(17)
pdf.text('Voila — Dispatch RF Tracker', 12, 14)

pdf.setTextColor(77, 217, 255)
pdf.setFontSize(12.5)
pdf.text('Locker Assignments', 12, 22)

pdf.setTextColor(165, 180, 201)
pdf.setFontSize(8)
pdf.text(`Exported: ${new Date().toLocaleString()}`, 12, 28)

    autoTable(pdf, {
  startY: 32,
  head: [['Locker #', 'Lock Combination', 'Day User', 'Night User']],
  body: exportRows.map((row) => [
    row.lockerNumber,
    row.combination,
    row.dayUser,
    row.nightUser,
  ]),
  theme: 'grid',
  margin: {
    top: 32,
    right: 10,
    bottom: 8,
    left: 10,
  },
  styles: {
    fontSize: 8.2,
    cellPadding: 2.8,
    minCellHeight: 8.4,
    textColor: [30, 41, 59],
    lineColor: [190, 205, 224],
    lineWidth: 0.15,
    valign: 'middle',
    overflow: 'linebreak',
    lineHeight: 1.12,
  },
  headStyles: {
    fillColor: [16, 27, 45],
    textColor: [241, 247, 255],
    fontStyle: 'bold',
    fontSize: 8.8,
    minCellHeight: 9.5,
  },
  alternateRowStyles: {
    fillColor: [239, 246, 255],
  },
  columnStyles: {
    0: { cellWidth: 27 },
    1: { cellWidth: 40 },
    2: { cellWidth: 104 },
    3: { cellWidth: 104 },
  },
  pageBreak: 'avoid',
  rowPageBreak: 'avoid',
})

    pdf.save(`${fileBaseName}.pdf`)
  }

  const exportExcel = () => {
    const worksheetData = [
      ['Locker #', 'Lock Combination', 'Day User', 'Night User'],
      ...exportRows.map((row) => [
        row.lockerNumber,
        row.combination,
        row.dayUser,
        row.nightUser,
      ]),
    ]

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData)

    worksheet['!cols'] = [
      { wch: 13 },
      { wch: 20 },
      { wch: 45 },
      { wch: 45 },
    ]

    const workbook = XLSX.utils.book_new()

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      'Locker Assignments'
    )

    XLSX.writeFile(workbook, `${fileBaseName}.xlsx`)
  }

  const exportWord = async () => {
    const createCell = (text, isHeader = false) =>
      new TableCell({
        width: {
          size: 25,
          type: WidthType.PERCENTAGE,
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text,
                bold: isHeader,
                color: isHeader ? 'FFFFFF' : '172033',
                size: isHeader ? 24 : 21,
                }),
            ],
          }),
        ],
        shading: isHeader
          ? {
              fill: '101B2D',
            }
          : undefined,
      })

    const document = new Document({
      sections: [
        {
          properties: {
            page: {
              size: {
                width: 16840,
                height: 11907,
              },
              margin: {
                top: 500,
                right: 500,
                bottom: 500,
                left: 500,
              },
            },
          },
          children: [
            new Paragraph({
              alignment: AlignmentType.LEFT,
              children: [
                new TextRun({
                  text: 'Voila — Dispatch RF Tracker',
                  bold: true,
                  size: 34,
                  color: '101B2D',
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: 'Locker Assignments',
                  bold: true,
                  size: 25,
                  color: '1DBFEA',
                }),
              ],
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `Exported: ${new Date().toLocaleString()}`,
                  size: 18,
                  color: '64748B',
                }),
              ],
            }),
            new Table({
              width: {
                size: 100,
                type: WidthType.PERCENTAGE,
              },
              rows: [
                new TableRow({
                  children: [
                    createCell('Locker #', true),
                    createCell('Lock Combination', true),
                    createCell('Day User', true),
                    createCell('Night User', true),
                  ],
                }),
                ...exportRows.map(
                  (row) =>
                    new TableRow({
                      children: [
                        createCell(row.lockerNumber),
                        createCell(row.combination),
                        createCell(row.dayUser),
                        createCell(row.nightUser),
                      ],
                    })
                ),
              ],
            }),
          ],
        },
      ],
    })

    const fileBlob = await Packer.toBlob(document)

    saveAs(fileBlob, `${fileBaseName}.docx`)
  }

  return (
    <div className="export-modal-backdrop" onMouseDown={onClose}>
      <section
        className="export-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="export-modal-header">
          <div>
            <p className="eyebrow">Export preview</p>
            <h2 id="export-preview-title">Locker Assignments</h2>
            <p>
              Review the decrypted locker assignment table before exporting.
            </p>
          </div>

          <button
            className="close-button"
            type="button"
            onClick={onClose}
            aria-label="Close export preview"
          >
            ×
          </button>
        </div>

        <div className="export-preview-table-wrapper">
          <table className="export-preview-table">
            <thead>
              <tr>
                <th>Locker #</th>
                <th>Lock Combination</th>
                <th>Day User</th>
                <th>Night User</th>
              </tr>
            </thead>

            <tbody>
              {exportRows.map((row) => (
                <tr key={row.lockerNumber}>
                  <td>{row.lockerNumber}</td>
                  <td className="export-combination">{row.combination}</td>
                  <td>{row.dayUser}</td>
                  <td>{row.nightUser}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="export-modal-actions">
          <button className="secondary-button" type="button" onClick={onClose}>
            Cancel
          </button>

          <button className="export-word-button" type="button" onClick={exportWord}>
            Export Word
          </button>

          <button
            className="export-excel-button"
            type="button"
            onClick={exportExcel}
          >
            Export Excel
          </button>

          <button className="primary-button" type="button" onClick={exportPdf}>
            Export 1-page PDF
          </button>
        </div>
      </section>
    </div>
  )
}

export default LockerExportModal