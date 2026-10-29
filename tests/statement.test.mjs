import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite, s;
before(async () => {
  vite = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false }, appType: "custom" });
  s = await vite.ssrLoadModule("/src/shared/statement.ts");
});
after(async () => { await vite?.close(); });

// A German savings-bank export: account details above the header, semicolons,
// day-first dates, decimal commas, the account holder's own IBAN in its own column.
const SPARKASSE = [
  "Umsätze Girokonto;;;;;;",
  "Kontonummer;DE12 5005 0201 0000 1234 56;;;;;",
  ";;;;;;",
  "Auftragskonto;Buchungstag;Valutadatum;Verwendungszweck;Name Zahlungsbeteiligter;IBAN Zahlungsbeteiligter;Betrag;Waehrung",
  'DE12500502010000123456;01.10.2026;01.10.2026;"Miete Oktober, Wohnung 101";REED MARCUS;DE89 3704 0044 0532 0130 00;1.650,00;EUR',
  "DE12500502010000123456;02.10.2026;02.10.2026;Enviado pela revolut;Hannah Lee;LT12 1000 0111 0100 1000;1.950,00;EUR",
  "DE12500502010000123456;03.10.2026;03.10.2026;Stadtwerke Abschlag;Stadtwerke Berlin;DE02 1001 0010 0006 8201 01;-84,50;EUR",
  ";;;;;Kontostand;5.000,00;EUR",
].join("\r\n");

test("a German bank CSV: preamble, semicolons, decimal commas, day-first dates", () => {
  const table = s.parseCsv(SPARKASSE);
  assert.equal(table.delimiter, ";");
  const map = s.guessMapping(table);
  assert.ok(map);
  assert.equal(map.header_row, 3);
  assert.equal(map.decimal, ",");
  assert.equal(map.date_order, "dmy");
  const header = table.rows[map.header_row];
  assert.equal(header[map.date], "Buchungstag");
  assert.equal(header[map.amount], "Betrag");
  assert.equal(header[map.payer_name], "Name Zahlungsbeteiligter");
  assert.equal(header[map.payer_account], "IBAN Zahlungsbeteiligter", "never the account holder's own Auftragskonto");
  assert.equal(header[map.reference], "Verwendungszweck");
  const { lines, errors } = s.readCsv(table, map);
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0], {
    booked_on: "2026-10-01", amount: 1650, currency: "EUR", payer_name: "REED MARCUS",
    payer_account: "DE89370400440532013000", reference: "Miete Oktober, Wohnung 101", bank_ref: null,
  });
  assert.equal(lines[2].amount, -84.5);
  assert.deepEqual(errors, [], "the closing balance row has no date: skipped, not reported");
});

test("a US bank CSV: description only, signed amounts, month-first dates", () => {
  const csv = [
    "Details,Posting Date,Description,Amount,Type,Balance,Check or Slip #",
    "CREDIT,10/01/2026,ZELLE FROM MARCUS REED ON 10/01 REF # PP0ABC123,1650.00,QUICKPAY_CREDIT,9450.00,,",
    "CREDIT,10/03/2026,Online Transfer from CHK ...1234,1950.00,ACCT_XFER,11400.00,,",
    "DEBIT,10/05/2026,HOME DEPOT #123,-212.37,DEBIT_CARD,11187.63,,",
  ].join("\n");
  const table = s.parseCsv(csv);
  const map = s.guessMapping(table);
  assert.equal(map.date_order, "mdy");
  assert.equal(map.decimal, ".");
  assert.equal(map.payer_name, null);
  const { lines } = s.readCsv(table, map);
  assert.equal(lines[0].booked_on, "2026-10-01");
  assert.equal(lines[0].amount, 1650);
  assert.equal(lines[0].reference, "ZELLE FROM MARCUS REED ON 10/01 REF # PP0ABC123");
  assert.equal(lines[2].amount, -212.37);
});

test("a UK bank CSV: separate paid-in and paid-out columns, text months", () => {
  const csv = [
    "Date,Description,Paid out,Paid in,Balance",
    '"01 Oct 2026","FASTER PAYMENT S OKAFOR RENT FLAT 2",,"1,150.00","3,200.00"',
    '"02 Oct 2026","DIRECT DEBIT COUNCIL TAX","145.00",,"3,055.00"',
  ].join("\n");
  const table = s.parseCsv(csv);
  const map = s.guessMapping(table);
  assert.equal(map.amount, null);
  const { lines } = s.readCsv(table, map);
  assert.deepEqual(lines.map((l) => [l.booked_on, l.amount]), [["2026-10-01", 1150], ["2026-10-02", -145]]);
});

test("amounts in every way banks write them", () => {
  for (const [raw, dec, want] of [
    ["1.650,00", ",", 1650], ["1,650.00", ".", 1650], ["-75,50", ",", -75.5], ["(75.00)", ".", -75],
    ["1'650.00", ".", 1650], ["€ 1.650,00", ",", 1650], ["1.650,00-", ",", -1650], ["+1650", ".", 1650], ["", ".", null],
  ]) assert.equal(s.parseAmount(raw, dec), want, raw);
});

test("a thousands group alone decides the decimal mark", () => {
  const table = s.parseCsv("Datum;Betrag;Name\n01.10.2026;1.650;Reed\n02.10.2026;900;Brooks\n");
  assert.equal(s.guessMapping(table).decimal, ",");
  assert.equal(s.readCsv(table, s.guessMapping(table)).lines[0].amount, 1650);
});

test("a row whose date is there but unreadable is reported", () => {
  const table = s.parseCsv("Datum;Betrag;Name\n01.10.2026;1.650,00;Reed\n31.13.2026;900,00;Brooks\n");
  const { lines, errors } = s.readCsv(table, s.guessMapping(table));
  assert.equal(lines.length, 1);
  assert.deepEqual(errors, [{ row: 3, message: 'Unreadable date "31.13.2026"' }]);
});

test("dates in every order banks write them", () => {
  assert.equal(s.parseDate("2026-10-01", "dmy"), "2026-10-01");
  assert.equal(s.parseDate("01.10.26", "dmy"), "2026-10-01");
  assert.equal(s.parseDate("10/01/2026", "mdy"), "2026-10-01");
  assert.equal(s.parseDate("01/10/2026", "dmy"), "2026-10-01");
  assert.equal(s.parseDate("20261001", "dmy"), "2026-10-01");
  assert.equal(s.parseDate("Oct 1, 2026", "mdy"), "2026-10-01");
  assert.equal(s.parseDate("31/02/2026x", "mdy"), null);
});

test("Windows-1252 exports decode, and a UTF-8 BOM is dropped", () => {
  const cp1252 = new Uint8Array([0x55, 0x6d, 0x73, 0xe4, 0x74, 0x7a, 0x65]); // "Umsätze"
  assert.equal(s.decodeBytes(cp1252.buffer), "Umsätze");
  const bom = new TextEncoder().encode("﻿Datum;Betrag");
  assert.equal(s.decodeBytes(bom.buffer), "Datum;Betrag");
});

const CAMT = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02">
 <BkToCstmrStmt><Stmt><Id>STMT-2026-10</Id>
  <Ntry>
   <Amt Ccy="EUR">1650.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts>
   <BookgDt><Dt>2026-10-01</Dt></BookgDt><ValDt><Dt>2026-10-01</Dt></ValDt>
   <AcctSvcrRef>2026100100001</AcctSvcrRef>
   <NtryDtls><TxDtls>
    <RltdPties><Dbtr><Nm>Marcus Reed</Nm></Dbtr><DbtrAcct><Id><IBAN>DE89370400440532013000</IBAN></Id></DbtrAcct></RltdPties>
    <RmtInf><Ustrd>Miete 10/2026 &amp; Nebenkosten</Ustrd></RmtInf>
   </TxDtls></NtryDtls>
  </Ntry>
  <Ntry>
   <Amt Ccy="EUR">84.50</Amt><CdtDbtInd>DBIT</CdtDbtInd>
   <BookgDt><Dt>2026-10-03</Dt></BookgDt>
   <NtryDtls><TxDtls><RltdPties><Cdtr><Nm>Stadtwerke</Nm></Cdtr></RltdPties></TxDtls></NtryDtls>
  </Ntry>
  <Ntry>
   <Amt Ccy="EUR">3600.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
   <BookgDt><Dt>2026-10-05</Dt></BookgDt><AcctSvcrRef>BATCH-7</AcctSvcrRef>
   <NtryDtls>
    <TxDtls><Refs><EndToEndId>E2E-1</EndToEndId></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">1650.00</Amt></TxAmt></AmtDtls>
     <RltdPties><Dbtr><Pty><Nm>Sofia Rossi</Nm></Pty></Dbtr></RltdPties>
     <RmtInf><Strd><CdtrRefInf><Ref>RF18539007547034</Ref></CdtrRefInf></Strd></RmtInf></TxDtls>
    <TxDtls><Refs><EndToEndId>NOTPROVIDED</EndToEndId></Refs><AmtDtls><TxAmt><Amt Ccy="EUR">1950.00</Amt></TxAmt></AmtDtls>
     <RltdPties><Dbtr><Nm>Ethan Walsh</Nm></Dbtr></RltdPties></TxDtls>
   </NtryDtls>
  </Ntry>
 </Stmt></BkToCstmrStmt>
</Document>`;

test("CAMT.053: payer, IBAN, reference, signs, and a batch booking split into its payments", () => {
  assert.equal(s.detectFormat(CAMT), "camt053");
  assert.equal(s.detectFormat("Datum;Betrag\n"), "csv");
  const lines = s.parseCamt(CAMT);
  assert.equal(lines.length, 4);
  assert.deepEqual(lines[0], {
    booked_on: "2026-10-01", amount: 1650, currency: "EUR", payer_name: "Marcus Reed",
    payer_account: "DE89370400440532013000", reference: "Miete 10/2026 & Nebenkosten", bank_ref: "2026100100001",
  });
  assert.equal(lines[1].amount, -84.5);
  assert.equal(lines[2].payer_name, "Sofia Rossi", "the v08 Dbtr/Pty/Nm layout");
  assert.equal(lines[2].reference, "RF18539007547034", "a structured creditor reference");
  assert.equal(lines[2].bank_ref, "E2E-1");
  assert.equal(lines[3].bank_ref, "BATCH-7#2", "NOTPROVIDED is not an id");
});

test("malformed XML is refused, not half-read", () => {
  assert.throws(() => s.parseCamt("<Document><BkToCstmrStmt></Document>"));
});
