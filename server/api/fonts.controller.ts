import { NextFunction, Request, Response } from "express";
import * as fs from "fs";
import * as https from "https";
import * as JSZip from "jszip";
import * as _ from "lodash";
import * as path from "path";
import { generateBase64Path, getFontBase64Cache, setFontBase64Cache } from "../logic/cache";
import { loadFontBundle, loadFontItems, loadFontSubsetArchive, loadSubsetMap, loadVariantItems } from "../logic/core";
import {
  IAPIFont,
  IAPIListFont,
  IBase64Font,
  IDownloadFontRequest,
  IDownloadFontResponse,
  IFontSubsetArchive,
  ILocalFont,
  IUserAgents,
  IVariantItem,
} from "../types";

// Get list of fonts
// /api/fonts
export async function getApiFonts(req: Request, res: Response<IAPIListFont[]>, next: NextFunction) {
  try {
    let fonts = loadFontItems();

    const sortOptions = ["popularity", "alphabetical", "newest"];
    const sort = _.isString(req.query.sort) ? req.query.sort.toLowerCase() : "popularity";

    // sort fonts based on query parameter
    if (sortOptions.includes(sort)) {
      switch (sort) {
        case "popularity":
          // already sorted by popularity from fetchGoogleFonts
          break;
        case "alphabetical":
          fonts = _.orderBy(fonts, ["family"], ["asc"]);
          break;
        case "newest":
          fonts = _.orderBy(fonts, ["lastModified"], ["desc"]);
          break;
      }
    }

    const apiListFonts: IAPIListFont[] = _.map(fonts, (font) => {
      return {
        id: font.id,
        family: font.family,
        variants: font.variants,
        subsets: font.subsets,
        category: font.category,
        version: font.version,
        lastModified: font.lastModified,
        popularity: font.popularity,
        defSubset: font.defSubset,
        defVariant: font.defVariant,
      };
    });

    return res.json(apiListFonts);
  } catch (e) {
    next(e);
  }
}

// Get specific fonts (fixed charsets) including links
// /api/fonts/:id
export async function getApiFontsById(req: Request, res: Response<IAPIFont | string | NodeJS.WritableStream>, next: NextFunction) {
  try {
    // get the subset string if it was supplied...
    // e.g. "subset=latin,latin-ext," will be transformed into ["latin","latin-ext"] (non whitespace arrays)
    const subsets = _.isString(req.query.subsets) ? _.without(req.query.subsets.split(/[,]+/), "") : null;

    const fontBundle = await loadFontBundle(req.params.id, subsets);

    if (_.isNil(fontBundle)) {
      return res.status(404).send("Not found");
    }

    const subsetMap = loadSubsetMap(fontBundle);
    const variantItems = await loadVariantItems(fontBundle);

    if (_.isNil(variantItems)) {
      return res.status(404).send("Not found");
    }

    // default case: json serialize...
    if (req.query.download !== "zip") {
      const { font } = fontBundle;

      const apiFont: IAPIFont = {
        id: font.id,
        family: font.family,
        subsets: font.subsets,
        category: font.category,
        version: font.version,
        lastModified: font.lastModified,
        popularity: font.popularity,
        defSubset: font.defSubset,
        defVariant: font.defVariant,
        subsetMap: subsetMap,
        // be compatible with legacy storeIDs, without binding on our new convention.
        storeID: fontBundle.subsets.join("_"),
        variants: _.map(variantItems, (variant) => {
          return {
            id: variant.id,
            fontFamily: variant.fontFamily,
            fontStyle: variant.fontStyle,
            fontWeight: variant.fontWeight,
            ..._.reduce(
              variant.urls,
              (sum, vurl) => {
                sum[vurl.format] = vurl.url;
                return sum;
              },
              {} as IUserAgents
            ),
          };
        }),
      };

      return res.json(apiFont);
    }

    // otherwise: download as zip
    const variants = _.isString(req.query.variants) ? _.without(req.query.variants.split(/[,]+/), "") : null;
    const formats = _.isString(req.query.formats) ? _.without(req.query.formats.split(/[,]+/), "") : null;

    let subsetFontArchive: IFontSubsetArchive;

    try {
      subsetFontArchive = await loadFontSubsetArchive(fontBundle, variantItems);
    } catch (e) {
      console.error("getApiFontsById.loadFontSubsetArchive received error -> 404", e);
      return res.status(404).send("Not found");
    }

    const filteredFiles = _.filter(subsetFontArchive.files, (file) => {
      return (_.isNil(variants) || _.includes(variants, file.variant)) && (_.isNil(formats) || _.includes(formats, file.format));
    });

    if (filteredFiles.length === 0) {
      return res.status(404).send("Not found");
    }

    // we build a new .zip from the existing cached .zip, filtered by the requested variants and formats.
    const archive = await loadZipArchive(subsetFontArchive.zipPath);

    // remove all files that are not in the filtered list.
    _.each(subsetFontArchive.files, function (file) {
      if (!_.includes(filteredFiles, file)) {
        archive.remove(file.path);
      }
    });

    // tell the browser that this is a zip file.
    res.writeHead(200, {
      "Content-Type": "application/zip",
      "Content-disposition": `attachment; filename=${path.basename(subsetFontArchive.zipPath)}`,
    });

    return archive
      .generateNodeStream({
        // streamFiles: true,
        compression: "DEFLATE",
      })
      .pipe(res);
  } catch (e) {
    next(e);
  }
}

// exported for testing
function loadZipArchive(zipPath: string): PromiseLike<JSZip> {
  return new JSZip.external.Promise(function (resolve, reject) {
    fs.readFile(zipPath, function (err, data) {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  }).then(function (data: unknown) {
    return JSZip.loadAsync(<Buffer>data);
  });
}

// Download fonts locally
// POST /api/fonts/:id/download
export async function downloadFontLocally(
  req: Request<{ id: string }, IDownloadFontResponse, IDownloadFontRequest>,
  res: Response<IDownloadFontResponse | string>,
  next: NextFunction
) {
  try {
    const fontId = req.params.id;
    const subsets = req.body.subsets || (_.isString(req.query.subsets) ? _.without(req.query.subsets.split(/[,]+/), "") : null);
    const variants = req.body.variants || (_.isString(req.query.variants) ? _.without(req.query.variants.split(/[,]+/), "") : null);
    const formats = req.body.formats || (_.isString(req.query.formats) ? _.without(req.query.formats.split(/[,]+/), "") : null);

    const fontBundle = await loadFontBundle(fontId, subsets);

    if (_.isNil(fontBundle)) {
      return res.status(404).send("Font not found");
    }

    const variantItems = await loadVariantItems(fontBundle);

    if (_.isNil(variantItems)) {
      return res.status(404).send("Variants not found");
    }

    // Create directory structure: fonts/{fontId}
    const localFontDir = path.join(process.cwd(), "fonts", fontId);

    if (!fs.existsSync(localFontDir)) {
      fs.mkdirSync(localFontDir, { recursive: true });
    }

    // Filter variants and formats
    const filteredVariants = _.filter(variantItems, (variant) => {
      return _.isNil(variants) || _.includes(variants, variant.id);
    });

    // Download all font files
    const downloadPromises: Promise<void>[] = [];
    const downloadedFiles: string[] = [];

    for (const variant of filteredVariants) {
      const filteredUrls = _.filter(variant.urls, (url) => {
        return _.isNil(formats) || _.includes(formats, url.format);
      });

      for (const urlInfo of filteredUrls) {
        const fileName = `${variant.id}.${urlInfo.format}`;
        const filePath = path.join(localFontDir, fileName);

        downloadPromises.push(
          downloadFile(urlInfo.url, filePath).then(() => {
            downloadedFiles.push(fileName);
          })
        );
      }
    }

    await Promise.all(downloadPromises);

    // // Generate CSS file
    // const cssContent = generateFontFaceCSS(filteredVariants, fontBundle.font.family, formats);
    // const cssPath = path.join(localFontDir, "fonts.css");
    // fs.writeFileSync(cssPath, cssContent);

    const response: IDownloadFontResponse = {
      id: fontId,
      family: fontBundle.font.family,
      localPath: `/api/fonts/${fontId}/local`,
      subsets: fontBundle.subsets,
      variants: _.map(filteredVariants, (v) => v.id),
      formats: formats || ["woff2", "woff"],
      downloadedAt: new Date().toISOString(),
    };

    return res.json(response);
  } catch (e) {
    next(e);
  }
}

// Serve local fonts
// GET /api/fonts/:id/local/:file
export async function serveLocalFont(req: Request<{ id: string; file: string }>, res: Response, next: NextFunction) {
  try {
    const { id, file } = req.params;
    const filePath = path.join(process.cwd(), "fonts", id, file);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send("File not found");
    }

    // Set appropriate content type based on file extension
    const ext = path.extname(file).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      ".woff": "font/woff",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
      ".eot": "application/vnd.ms-fontobject",
      ".svg": "image/svg+xml",
      ".css": "text/css",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (e) {
    next(e);
  }
}

// Helper function to download a file
function downloadFile(url: string, filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(filePath)) {
      // File already exists, skip download
      return resolve();
    }

    const file = fs.createWriteStream(filePath);

    https
      .get(url, (response) => {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: ${url}, status: ${response.statusCode}`));
          return;
        }

        response.pipe(file);

        file.on("finish", () => {
          file.close();
          resolve();
        });
      })
      .on("error", (err) => {
        fs.unlink(filePath, () => {
          // Ignore unlink errors
        });
        reject(err);
      });
  });
}

// Helper function to generate CSS with @font-face rules
function generateFontFaceCSS(variants: IVariantItem[], fontFamily: string, formats: string[] | null): string {
  const selectedFormats = formats || ["woff2", "woff"];

  const fontFaces = _.map(variants, (variant) => {
    const sources = _.map(variant.urls, (url) => {
      if (!_.includes(selectedFormats, url.format)) {
        return null;
      }

      const fileName = `${variant.id}.${url.format}`;
      const formatMap: { [key: string]: string } = {
        woff2: "woff2",
        woff: "woff",
        ttf: "truetype",
        eot: "embedded-opentype",
        svg: "svg",
      };

      return `url('${fileName}') format('${formatMap[url.format] || url.format}')`;
    }).filter(Boolean);

    return `@font-face {
  font-family: '${fontFamily}';
  font-style: ${variant.fontStyle || "normal"};
  font-weight: ${variant.fontWeight || "400"};
  src: ${sources.join(",\n       ")};
}`;
  });

  return `/* ${fontFamily} - Generated by webfonts-helper */\n\n${fontFaces.join("\n\n")}\n`;
}

// Get list of locally downloaded fonts
// GET /api/fonts/local
export async function getLocalFonts(req: Request, res: Response<ILocalFont[]>, next: NextFunction) {
  try {
    const fontsDir = path.join(process.cwd(), "fonts");

    if (!fs.existsSync(fontsDir)) {
      return res.json([]);
    }

    const localFonts: ILocalFont[] = [];
    const fontDirs = fs.readdirSync(fontsDir);

    for (const fontId of fontDirs) {
      const fontPath = path.join(fontsDir, fontId);
      const stat = fs.statSync(fontPath);

      if (!stat.isDirectory()) {
        continue;
      }

      const files = fs.readdirSync(fontPath);

      const fontFiles = _.filter(
        files,
        (f) => f.endsWith(".woff") || f.endsWith(".woff2") || f.endsWith(".ttf") || f.endsWith(".eot") || f.endsWith(".svg")
      );

      const variants = _.uniq(_.map(fontFiles, (f) => f.split(".")[0]));

      // Try to get font family from the font items
      const fonts = loadFontItems();
      const fontItem = _.find(fonts, { id: fontId });

      localFonts.push({
        id: fontId,
        family: fontItem?.family || fontId,
        subsets: fontItem?.subsets || [],
        variants,
        path: `/api/fonts/${fontId}/local`,
      });
    }

    return res.json(localFonts);
  } catch (e) {
    next(e);
  }
}

/**
 * Get the base64 data for a font id
 *
 * @param req
 * @param res
 * @param next
 */
export async function getFontBase64Data(req: Request, res: Response<string>, next: NextFunction) {
  // get the variant string
  // e.g. "subset=latin,latin-ext," will be transformed into ["latin","latin-ext"] (non whitespace arrays)
  const subsets = _.isString(req.query.subsets) ? _.without(req.query.subsets.split(/[,]+/), "") : null;

  if (_.isNil(subsets) || subsets.length === 0) {
    return res.status(400).send("Bad Request - missing variant query parameter");
  }

  const variants = _.isString(req.query.variants) ? _.without(req.query.variants.split(/[,]+/), "") : null;
  if (_.isNil(variants)) {
    return res.status(400).send("Bad Request - missing variants query parameter");
  }

  const format = _.isString(req.query.format) ? req.query.format : null;

  const fontBundle = await loadFontBundle(req.params.id, subsets);

  if (_.isNil(fontBundle)) {
    return res.status(404).send("Font not found.");
  }

  const subsetMap = loadSubsetMap(fontBundle);
  if (_.isNil(subsetMap)) {
    return res.status(404).send("No subsets found for this font.");
  }

  // check if requested subsets are valid
  for (const subset of subsets) {
    if (!subsetMap[subset]) {
      // remove invalid subset from the list
      subsets.splice(subsets.indexOf(subset), 1);
    }
  }

  const variantItems = await loadVariantItems(fontBundle);

  if (_.isNil(variantItems)) {
    return res.status(404).send("No variants found for this font.");
  }

  // const matchedVariant = _.find(variantItems, (variant) => {
  // 	return variant.weight === weight && variant.style === style;
  // });

  const matchedVariants: IVariantItem[] = [];
  for (const variant of variantItems) {
    if (variant.id && variants.includes(variant.id)) {
      matchedVariants.push(variant);
    }
  }

  if (!matchedVariants || matchedVariants.length === 0) {
    return res.status(404).send("Variant not found.");
  }

  let fontFormatPriority = ["woff2", "woff", "ttf", "eot", "svg"];
  if (format) {
    fontFormatPriority = [format];
  }
  const fontsToReturn: IBase64Font[] = [];
  // return base64 data for each url in matchedVariant
  for (const matchedVariant of matchedVariants) {
    // pick the best format available based on priority
    let bestUrlInfo = null;
    for (const format of fontFormatPriority) {
      const urlInfo = _.find(matchedVariant.urls, (u) => u.format === format);
      if (urlInfo) {
        bestUrlInfo = urlInfo;
        break;
      }
    }

    if (!bestUrlInfo) {
      return res.status(500).send(`No valid font URL found for variant ${matchedVariant.id}`);
    }

    const base64Path = await generateBase64Path(fontBundle, matchedVariant, bestUrlInfo, subsets);

    let base64 = await getFontBase64Cache(base64Path);

    if (!base64) {
      try {
        const response = await fetch(bestUrlInfo.url);
        if (!response.ok) {
          return res.status(500).send(`Failed to fetch font file from ${bestUrlInfo.url}`);
        }

        base64 = await setFontBase64Cache(bestUrlInfo, response, base64Path);
      } catch (e: any) {
        return res.status(500).send(`Error fetching font file from ${bestUrlInfo.url}: ${e.message}`);
      }
    }

    if (!base64) {
      return res.status(500).send(`Failed to get base64 data for font from ${bestUrlInfo.url}`);
    }

    fontsToReturn.push({
      id: matchedVariant.id,
      family: matchedVariant.fontFamily || fontBundle.font.family,
      // all subsets separated by comma
      subset: fontBundle.subsets.join(","),
      style: matchedVariant.fontStyle || "normal",
      weight: matchedVariant.fontWeight || "400",
      base64: base64,
    });
  }

  res.set("Content-Type", "application/json").send(JSON.stringify(fontsToReturn));
}
