export type OrgProfile = {
  id: string;
  slug: string;
  legalName: string;
  entityType: string;
  fiscalYearEnd: string;
  cadence: "bimonthly" | "monthly" | "quarterly";
  booksStart: string;
  registrationType: string;
  ssmNumber: string;
  sstNumber: string;
  tin: string;
  address: string;
  postcode: string;
  city: string;
  state: string;
  defaultPricingMode: "exclusive" | "inclusive";
  phone: string;
  msicCode: string;
  businessActivityDescription: string;
  defaultClassificationCode: string;
  myinvoisMandateEffectiveOn: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  duitnowId: string;
  paymentNote: string;
  logoPath: string | null;
  logoUrl: string | null;
  paymentQrPath: string | null;
  paymentQrUrl: string | null;
  firstYearStart: string;
  canChangeFye: boolean;
};

export const MY_STATES = [
  "Johor",
  "Kedah",
  "Kelantan",
  "Melaka",
  "Negeri Sembilan",
  "Pahang",
  "Perak",
  "Perlis",
  "Pulau Pinang",
  "Sabah",
  "Sarawak",
  "Selangor",
  "Terengganu",
  "W.P. Kuala Lumpur",
  "W.P. Labuan",
  "W.P. Putrajaya",
] as const;

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  sdn_bhd: "Sdn Bhd",
  sole_prop: "Sole Proprietorship",
  partnership: "Partnership",
  llp: "LLP",
};
