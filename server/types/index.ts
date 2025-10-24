export interface ISubsetMap {
  [subset: string]: boolean;
}

export interface IUserAgents {
  eot: string;
  woff: string;
  woff2: string;
  svg: string;
  ttf: string;
}

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

export interface IVariantURL {
  format: keyof IUserAgents;
  url: string;
}

export interface IVariantItem {
  id: string;
  fontFamily: null | string;
  fontStyle: null | string;
  fontWeight: null | string;
  urls: IVariantURL[];
}

export interface IResource {
  src: string | null;
  fontFamily: string | null;
  fontStyle: string | null;
  fontWeight: string | null;
  url: string;
}

export interface IFontSubsetArchive {
  zipPath: string; // absolute path to the zip file
  files: IFontFile[];
}

export interface IFontFile {
  variant: string;
  format: string;
  path: string; // relative path within the zip file
}

export interface IFontItem {
  id: string;
  family: string;
  subsets: string[];
  category: string;
  version: string;
  lastModified: string;
  popularity: number;
  defSubset: string;
  defVariant: string;
  variants: string[];
}

export interface IGoogleFontsRes {
  kind: string;
  items: IGoogleFontsResItem[];
}

export interface IGoogleFontsResItem {
  family: string;
  variants: string[];
  subsets: string[];
  version: string;
  lastModified: string;
  files: {
    [key: string]: string;
  };
  category: string;
  kind: "webfonts#webfont";
}

export interface IBase64Font {
  id: string;
  family: string;
	subset: string;
  style: string;
  weight: string;
  base64: string;
}
