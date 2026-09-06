from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "frontend" / "public" / "docs" / "account-radar-anleitung-faq.pdf"

NAVY = colors.HexColor("#10233F")
BLUE = colors.HexColor("#1976D2")
LIGHT_BLUE = colors.HexColor("#EAF3FC")
GREEN = colors.HexColor("#168A55")
LIGHT_GREEN = colors.HexColor("#EAF7F0")
ORANGE = colors.HexColor("#E87918")
LIGHT_GRAY = colors.HexColor("#F4F6F8")
MID_GRAY = colors.HexColor("#667085")
BORDER = colors.HexColor("#D8DEE8")


styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="GuideTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=29, textColor=NAVY, spaceAfter=8))
styles.add(ParagraphStyle(name="GuideSubtitle", parent=styles["BodyText"], fontName="Helvetica", fontSize=11, leading=16, textColor=MID_GRAY, spaceAfter=14))
styles.add(ParagraphStyle(name="GuideH1", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=NAVY, spaceBefore=8, spaceAfter=10))
styles.add(ParagraphStyle(name="GuideH2", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=NAVY, spaceAfter=4))
styles.add(ParagraphStyle(name="GuideBody", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.4, leading=13.5, textColor=colors.HexColor("#25334A"), spaceAfter=5))
styles.add(ParagraphStyle(name="GuideSmall", parent=styles["BodyText"], fontName="Helvetica", fontSize=8, leading=11, textColor=MID_GRAY))
styles.add(ParagraphStyle(name="GuideCardNo", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=15, leading=17, textColor=colors.white, alignment=TA_LEFT))
styles.add(ParagraphStyle(name="GuideFaqQ", parent=styles["BodyText"], fontName="Helvetica-Bold", fontSize=9.5, leading=13, textColor=NAVY, spaceAfter=3))


def p(text, style="GuideBody"):
    return Paragraph(text, styles[style])


def page_header_footer(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 12 * mm, width, 12 * mm, stroke=0, fill=1)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 8.5)
    canvas.drawString(18 * mm, height - 7.5 * mm, "MOBILITI ACCOUNT-RADAR")
    canvas.setFillColor(MID_GRAY)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(18 * mm, 10 * mm, "Anleitung & FAQ - Stand September 2026")
    canvas.drawRightString(width - 18 * mm, 10 * mm, f"Seite {doc.page}")
    canvas.restoreState()


def section_card(number, title, body):
    number_cell = Table([[p(str(number), "GuideCardNo")]], colWidths=[12 * mm], rowHeights=[12 * mm])
    number_cell.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BLUE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("ROUNDEDCORNERS", [5]),
    ]))
    content = [p(title, "GuideH2"), p(body)]
    card = Table([[number_cell, content]], colWidths=[16 * mm, 150 * mm])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), LIGHT_GRAY),
        ("BOX", (0, 0), (-1, -1), 0.6, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return KeepTogether([card, Spacer(1, 5)])


def info_box(title, body, background=LIGHT_BLUE, accent=BLUE):
    table = Table([[p(title, "GuideH2")], [p(body)]], colWidths=[166 * mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), background),
        ("BOX", (0, 0), (-1, -1), 0.8, accent),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return table


def build_pdf():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=20 * mm,
        bottomMargin=18 * mm,
        title="Mobiliti Account-Radar - Anleitung und FAQ",
        author="Mobiliti",
        subject="Schnellstart, Rollen, Datenqualität, Pakete und FAQ",
    )

    story = [
        Spacer(1, 7 * mm),
        p("Account-Radar", "GuideTitle"),
        p("Anleitung & FAQ für Vertriebsteams", "GuideSubtitle"),
        info_box(
            "Vom Signal zum nächsten Schritt",
            "Der Account-Radar bündelt relevante Veränderungen bei Kunden, Interessenten und Wettbewerbern. Das Team priorisiert Signale, plant Kontakte und dokumentiert Ergebnisse mandantenspezifisch an einem Ort.",
        ),
        Spacer(1, 8 * mm),
        p("Schnellstart in fünf Schritten", "GuideH1"),
        section_card(1, "Accounts anlegen", "Kunden und Interessenten mit Website, Region, Branche, Verantwortlichem und Ansprechpartnern erfassen. In Premium können Wettbewerber zugeordnet werden."),
        section_card(2, "Signale prüfen", "Im Tab <b>Aktuell</b> Relevanz, Quelle, Begründung und vorgeschlagenen nächsten Schritt kontrollieren."),
        section_card(3, "Verantwortung klären", "Account oder Aufgabe einer Person aus dem eigenen Sales-Team zuweisen. Name und E-Mail machen die Auswahl eindeutig."),
        section_card(4, "Kontakt oder Wiedervorlage planen", "Termin, Kontaktkanal, Ansprechpartner, Notiz und optionales Umsatzpotenzial festlegen. Termine können als ICS-Datei geteilt werden."),
        section_card(5, "Ergebnis dokumentieren", "Pipeline-Phase pflegen und den Vorgang erledigen. Falsche Treffer werden begründet als nicht relevant markiert und bleiben nachvollziehbar."),
        PageBreak(),
        p("Bereiche und Kennzahlen", "GuideH1"),
    ]

    areas = [
        [p("Bereich", "GuideH2"), p("Bedeutung", "GuideH2")],
        [p("Aktuell"), p("Offene Signale im gewählten Zeitraum. Zukünftig geplante Kontakte werden nicht mitgezählt.")],
        [p("Accounts"), p("Gesamter Bestand mit Status, Account-Verantwortung, Ansprechpartnern, Wettbewerbern und accountbezogener Datenqualität.")],
        [p("Geplant"), p("Kontakttermine und Wiedervorlagen mit Zuständigkeit, verbleibender Zeit und Kalenderexport.")],
        [p("Erledigt"), p("Abgeschlossene Vorgänge. Sie können bei Bedarf wieder geöffnet werden.")],
        [p("Gesamter offener Bestand"), p("Alle offenen Signale über sämtliche Zeiträume. Deshalb kann der Wert höher sein als im Tab Aktuell.")],
    ]
    areas_table = Table(areas, colWidths=[42 * mm, 124 * mm], repeatRows=1)
    areas_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT_GRAY]),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([
        areas_table,
        Spacer(1, 8 * mm),
        p("Datenqualität", "GuideH1"),
        info_box("Qualität dieses Accounts", "Das Detaildiagramm prüft acht Kernangaben: Website, Logo, Adresse, zentraler Kontakt, Account-Verantwortung, Ansprechpartner, Region und Branche.", LIGHT_GREEN, GREEN),
        Spacer(1, 4 * mm),
        info_box("Mandantenweite Qualität", "Die Gesamtprüfung berücksichtigt zusätzlich doppelte Domains und Namen, überfällige oder nicht zugewiesene Aufgaben, Kontaktplanungen ohne Ansprechpartner, offene Pipeline ohne Umsatzpotenzial und seit mehr als 180 Tagen ungepflegte Accounts."),
        Spacer(1, 8 * mm),
        p("Rollen und Mandantentrennung", "GuideH1"),
        p("<b>Admin:</b> verwaltet alle Mandanten und Pakete. <b>Assistenz:</b> arbeitet ausschließlich im eigenen Mandanten. <b>Sales-Manager:</b> verwaltet Accounts, Team-Zuweisungen und Radar-Einstellungen. <b>Sales-Nutzer:</b> nutzt Radar und lesende Account-Details. <b>Demo:</b> ist nicht editierbar."),
        p("Account-, Kontakt-, Aufgaben-, Report- und API-Daten werden anhand der Mandanten-ID getrennt. Ein Nutzer kann keine Accounts eines fremden Mandanten zuweisen oder abrufen."),
        PageBreak(),
        p("Pakete im Überblick", "GuideH1"),
    ])

    package_rows = [
        [p("Funktion", "GuideH2"), p("Sales Basic", "GuideH2"), p("Sales Premium", "GuideH2")],
        [p("Accounts"), p("bis 250"), p("bis 5.000")],
        [p("Team-Zuweisung & Workflows"), p("Enthalten"), p("Enthalten")],
        [p("Radar-Mail"), p("wöchentlich, bis 3 Empfänger"), p("täglich / werktäglich / wöchentlich, bis 25 Empfänger")],
        [p("Datenpflege"), p("CSV-Export, Qualitätsprüfung"), p("zusätzlich CSV-/Excel-Import")],
        [p("Wettbewerber"), p("-"), p("Monitoring enthalten")],
        [p("Auswertung"), p("Arbeitscockpit"), p("Analytics, Sales-Erfolg, Management-PDF")],
        [p("KI & API"), p("-"), p("KI-Sales-Kontext, API mit bis zu 5 Tokens")],
    ]
    package_table = Table(package_rows, colWidths=[56 * mm, 50 * mm, 60 * mm], repeatRows=1)
    package_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), NAVY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND", (2, 1), (2, -1), LIGHT_GREEN),
        ("ROWBACKGROUNDS", (0, 1), (1, -1), [colors.white, LIGHT_GRAY]),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([
        package_table,
        Spacer(1, 8 * mm),
        p("Sicherer Umgang mit Integrationen", "GuideH1"),
        info_box("API-Tokens sind Zugangsschlüssel", "Nur benötigte Berechtigungen wählen, Token unmittelbar sicher speichern, niemals in Screenshots oder unverschlüsselten E-Mails teilen und nicht mehr benötigte Tokens widerrufen.", colors.HexColor("#FFF5E8"), ORANGE),
        Spacer(1, 4 * mm),
        p("Für einfache Übergaben genügen CSV-Export und - in Premium - CSV-/Excel-Import. Die API ist für dauerhafte CRM-, BI- oder Verlagssystem-Anbindungen vorgesehen. Schreibzugriffe nutzen eine externe ID, damit wiederholte Synchronisierungen keine doppelten Accounts oder Aufgaben erzeugen."),
        PageBreak(),
        p("FAQ", "GuideH1"),
    ])

    faqs = [
        ("Warum unterscheiden sich Aktuell und gesamter offener Bestand?", "Aktuell berücksichtigt den gewählten Zeitraum und keine zukünftigen Planungen. Der gesamte offene Bestand zählt alle noch offenen Signale über sämtliche Zeiträume."),
        ("Was bedeutet der Relevanzwert?", "Er priorisiert die inhaltliche Nähe zum Account und zu den konfigurierten Themen. Er ersetzt nicht die fachliche Prüfung durch das Sales-Team."),
        ("Wie erkenne ich den ausgewählten Account?", "Der Account erhält einen farbigen Rahmen und die Markierung Ausgewählt. Oberhalb der Liste kann die Auswahl aufgehoben werden."),
        ("Kann ein Wettbewerber direkt geöffnet werden?", "Ja. Der Klick auf den Wettbewerber zeigt dessen Stammdaten und das zugehörige Signal mit Quelle, Relevanz, Begründung und nächstem Schritt."),
        ("Wer darf Account-Daten ändern?", "Admin, Assistenz und Sales-Manager dürfen Accounts und Kontakte verwalten. Sales-Nutzer erhalten eine lesende Detailansicht."),
        ("Was passiert mit einem nicht relevanten Treffer?", "Er wird mit Begründung ausgeblendet, bleibt nachvollziehbar und kann später wieder als relevant markiert werden."),
        ("Wie teile ich einen geplanten Kontakt?", "Bei einem terminierten Kontakt oder einer Wiedervorlage steht eine ICS-Kalenderdatei zum Download oder Teilen bereit."),
        ("Wo finde ich Hilfe im System?", "Im Sales-Menü unter Anleitung & FAQ. Dort steht auch diese PDF-Fassung zum Download bereit."),
    ]
    for question, answer in faqs:
        story.append(KeepTogether([
            p(question, "GuideFaqQ"),
            p(answer),
            Spacer(1, 3 * mm),
        ]))

    story.extend([
        Spacer(1, 4 * mm),
        info_box("Empfohlener täglicher Ablauf", "1. Aktuelle Signale priorisieren. 2. Zuständigkeit prüfen. 3. Kontakt oder Wiedervorlage planen. 4. Ergebnis und Pipeline-Phase dokumentieren. 5. Datenlücken direkt im Account-Detail schließen.", LIGHT_GREEN, GREEN),
    ])

    doc.build(story, onFirstPage=page_header_footer, onLaterPages=page_header_footer)
    print(OUTPUT)


if __name__ == "__main__":
    build_pdf()
