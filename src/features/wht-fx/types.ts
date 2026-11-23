export type WhtSectionCode =
  | "s109b_special"
  | "s109_royalty"
  | "s109_interest"
  | "s107a_contract"
  | "s109f_other"
  | "s107d_commission";

export type WhtFormCode = "CP37" | "CP37A" | "CP37D" | "CP37F" | "CP107D";

export const WHT_SECTIONS: Array<{
  code: WhtSectionCode;
  form: WhtFormCode;
  defaultRate: number;
  label: string;
  desc: string;
}> = [
  {
    code: "s109b_special",
    form: "CP37D",
    defaultRate: 10,
    label: "s.109B — Technical, management & movable property rent (10%)",
    desc: "Form CP37D · Non-resident special classes of income",
  },
  {
    code: "s109_royalty",
    form: "CP37",
    defaultRate: 10,
    label: "s.109 — Royalty paid to non-resident (10%)",
    desc: "Form CP37 · Software, IP, franchise or trademark royalties",
  },
  {
    code: "s109_interest",
    form: "CP37",
    defaultRate: 15,
    label: "s.109 — Interest paid to non-resident (15%)",
    desc: "Form CP37 · Cross-border loan or financing interest",
  },
  {
    code: "s107a_contract",
    form: "CP37A",
    defaultRate: 13,
    label: "s.107A — Non-resident contract payments (10% + 3% = 13%)",
    desc: "Form CP37A · Contract services performed in Malaysia",
  },
  {
    code: "s109f_other",
    form: "CP37F",
    defaultRate: 10,
    label: "s.109F — Other gains or profits s.4(f) (10%)",
    desc: "Form CP37F · Commissions or referral fees to non-residents",
  },
  {
    code: "s107d_commission",
    form: "CP107D",
    defaultRate: 2,
    label: "s.107D — Resident agent / dealer commission > RM100k (2%)",
    desc: "Form CP107D · Monetary payments to individual agents/distributors",
  },
];

export type WhtEntryRow = {
  id: string;
  whtNumber: string;
  payeeName: string;
  payeeTin: string | null;
  payeeCountry: string;
  sectionCode: WhtSectionCode;
  formCode: WhtFormCode;
  paymentDate: string;
  dueDate: string;
  currencyCode: string;
  exchangeRate: number;
  grossForeign: number;
  grossMyr: number;
  whtRate: number;
  whtMyr: number;
  netPaidMyr: number;
  memo: string | null;
  status: "unremitted" | "remitted" | "void";
  journalEntryId: string | null;
  remittedOn: string | null;
  remittanceRef: string | null;
  remittanceJournalId: string | null;
};

export type FxRevaluationRow = {
  id: string;
  revalDate: string;
  accountId: string;
  accountLabel: string;
  currencyCode: string;
  foreignBalance: number;
  closingRate: number;
  carryingMyr: number;
  revaluedMyr: number;
  gainLossMyr: number;
  memo: string | null;
  status: "posted" | "reversed";
  journalEntryId: string | null;
  reversalJournalId: string | null;
};

export type AccountChoice = {
  id: string;
  code: string;
  name: string;
  type: string;
  isCash: boolean;
};
