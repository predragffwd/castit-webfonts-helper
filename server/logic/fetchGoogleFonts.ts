import * as fs from "fs/promises";
import * as _ from "lodash";
import * as path from "path";
import * as speakingurl from "speakingurl";
import { config } from "../config";
import { asyncRetry } from "../utils/asyncRetry";
import axios from "axios";

const RETRIES = 2;
const REQUEST_TIMEOUT_MS = 10000;

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

interface IGoogleFontsRes {
  kind: string;
  items: IGoogleFontsResItem[];
}

interface IGoogleFontsResItem {
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

// build up fonts cache via google API...
export async function fetchGoogleFonts(sort = "popularity"): Promise<IFontItem[]> {
  if (config.GOOGLE_FONTS_USE_TEST_JSON) {
    const localPath = path.join(config.ROOT, "test/googlefonts.json");

    if (config.ENV !== "test") {
      console.warn(`fetchGoogleFonts is using local "${localPath}"`);
    }

    const testJson = await fs.readFile(localPath);
    return transform(JSON.parse(testJson.toString()));
  }

  return asyncRetry(
    async () => {
      const res = await axios.get<IGoogleFontsRes>(`https://www.googleapis.com/webfonts/v1/webfonts?sort=${sort}&key=${config.GOOGLE_FONTS_API_KEY}`, {
        timeout: REQUEST_TIMEOUT_MS,
        responseType: "json",
        maxRedirects: 0 // https://github.com/axios/axios/issues/2610
      });

      return transform(res.data);

    },
    { retries: RETRIES }
  );
}

function transform(resData: IGoogleFontsRes): IFontItem[] {
  return _.map(resData.items, (item, index) => {
    return {
      id: speakingurl(item.family),
      family: item.family,
      variants: item.variants,
      subsets: item.subsets,
      category: item.category,
      version: item.version,
      lastModified: item.lastModified,
      popularity: index + 1, // property order by popularity -> index
      // use latin per default, else first found font
      defSubset: _.includes(item.subsets, "latin") ? "latin" : item.subsets[0],
      defVariant: _.includes(item.variants, "regular") ? "regular" : item.variants[0],
    };
  });
}
