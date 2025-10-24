export interface IAPIListFont {
  id: string;
  family: string;
  variants: string[];
  subsets: string[];
  category: string;
  version: string;
  lastModified: string; // e.g. 2022-09-22
  popularity: number;
  defSubset: string;
  defVariant: string;
}

export interface IAPIFont {
  id: string;
  family: string;
  subsets: string[];
  category: string;
  version: string;
  lastModified: string; // e.g. 2022-09-22
  popularity: number;
  defSubset: string;
  defVariant: string;
  subsetMap: {
    [subset: string]: boolean;
  };
  storeID: string;
  variants: {
    id: string;
    fontFamily: string | null;
    fontStyle: string | null;
    fontWeight: string | null;
    eot?: string;
    woff?: string;
    woff2?: string;
    svg?: string;
    ttf?: string;
  }[];
}

export interface IDownloadFontRequest {
  subsets?: string[];
  variants?: string[];
  formats?: string[];
}

export interface IDownloadFontResponse {
  id: string;
  family: string;
  localPath: string;
  subsets: string[];
  variants: string[];
  formats: string[];
  downloadedAt: string;
}

export interface ILocalFont {
  id: string;
  family: string;
  subsets: string[];
  variants: string[];
  path: string;
}