export type AssetStatus = "active" | "fully_depreciated" | "disposed";

export type FixedAssetRow = {
  id: string;
  assetCode: string;
  name: string;
  assetAccountLabel: string;
  accumDepAccountLabel: string;
  depExpenseAccountLabel: string;
  purchaseDate: string;
  depreciationStart: string;
  costSen: number;
  residualSen: number;
  usefulLifeMonths: number;
  accumDepSen: number;
  nbvSen: number;
  status: AssetStatus;
  disposedOn: string | null;
  disposalProceedsSen: number | null;
  disposalEntryId: string | null;
  notes: string;
};

export type DepreciationRunRow = {
  id: string;
  periodMonth: string;
  postedOn: string;
  amountSen: number;
  journalEntryId: string;
};

export type AssetAccountOpt = {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  normalBalance: string;
  parentId: string | null;
  isCash: boolean;
};
