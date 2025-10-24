import { access, mkdir, readdir, readFile, rmdir, stat, writeFile } from "fs/promises";
import * as _ from "lodash";
import { dirname, join } from "path";
import { config } from "../config";
import { IFontBundle } from "./store";
import { IFontItem, IVariantItem } from "../types";

const CACHE_SUBDIR = "variants";

/**
 * Get the cache file path for a font bundle
 * File name format: {fontID}@v{version}__{subset1_subset2}.json
 */
function getCacheFilePath(storeID: string): string {
  const fontNameAndVersion = storeID.split("__")[0];
  const fontName = fontNameAndVersion.split("@v")[0];
  const version = fontNameAndVersion.split("@v")[1] || "1";
  return join(config.CACHE_DIR, CACHE_SUBDIR, fontName, version, `${storeID}.json`);
}

/**
 * Check if a cache file exists, ensure directory structure exists
 */
async function cacheFileExists(filePath: string): Promise<boolean> {
  try {
    // First ensure the directory structure exists
    await mkdir(dirname(filePath), { recursive: true });

    // Then check if the file exists
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get cached variant items from file system
 */
export async function getCachedVariantItems({ storeID }: IFontBundle): Promise<IVariantItem[] | null> {
  try {
    const cacheFilePath = getCacheFilePath(storeID);

    if (!(await cacheFileExists(cacheFilePath))) {
      return null;
    }

    const fileContent = await readFile(cacheFilePath, "utf-8");
    const cachedData = JSON.parse(fileContent);

    // Validate the cached data structure
    if (!_.isArray(cachedData) || !isValidVariantItemsArray(cachedData)) {
      console.warn(`Invalid cached variant items for storeID=${storeID}, removing cache file`);
      // Optionally remove the invalid cache file
      return null;
    }

    return cachedData as IVariantItem[];
  } catch (error) {
    console.error(`Error reading cached variant items for storeID=${storeID}:`, error);
    return null;
  }
}

/**
 * Store variant items to file system cache
 */
export async function storeCachedVariantItems({ storeID }: IFontBundle, variantItems: IVariantItem[]): Promise<void> {
  try {
    const cacheFilePath = getCacheFilePath(storeID);
    const cacheDir = join(config.CACHE_DIR, CACHE_SUBDIR);

    // Ensure cache directory exists
    await mkdir(cacheDir, { recursive: true });

    // Write variant items to cache file
    await writeFile(cacheFilePath, JSON.stringify(variantItems, null, 2), "utf-8");
  } catch (error) {
    console.error(`Error storing cached variant items for storeID=${storeID}:`, error);
    // Don't throw error to avoid breaking the main flow
  }
}

/**
 * Validate that the cached data is a valid IVariantItem array
 */
function isValidVariantItemsArray(data: IVariantItem[]): boolean {
  if (!_.isArray(data)) {
    return false;
  }

  return data.every(
    (item) =>
      _.isObject(item) && _.isString(item.fontFamily) && _.isString(item.fontStyle) && _.isString(item.fontWeight) && _.isArray(item.urls)
  );
}

/**
 * Clear all cached variant items
 */
export async function clearVariantItemsCache(): Promise<void> {
  try {
    const { rm } = await import("fs/promises");
    const cacheDir = join(config.CACHE_DIR, CACHE_SUBDIR);
    await rm(cacheDir, { recursive: true, force: true });
  } catch (error) {
    console.error("Error clearing variant items cache:", error);
  }
}

/**
 * Clean outdated variant items cache based on valid store IDs
 */
export async function cleanOutdatedVariantItemsCache(fontMap: Map<string, IFontItem>): Promise<void> {
  // read all files from the cache directory
  const cacheDir = join(config.CACHE_DIR, CACHE_SUBDIR);
	// ensure cache directory exists
	await mkdir(cacheDir, { recursive: true });	

  // fonts cached files are store under logic/cachedFonts/variants/{fontID@v{version}__{subsets}.json
  const cachedFonts = await getCachedFontVersion(cacheDir);

  for (const fontID in cachedFonts) {
    console.log(fontID);
    const currentVersion = cachedFonts[fontID];

    // check in fontMap if the fontID exists and get its latest version
    const fontItem = fontMap.get(fontID);
    if (!fontItem) {
      // font no longer exists, remove all its cached versions
      rmdir(join(cacheDir, fontID), { recursive: true });
      continue;
    }

    // font exists, check its version (v{version_number}) and remove outdated ones
    const latestVersion = fontItem.version.replace("v", "");
    if (latestVersion !== currentVersion) {
      // remove all versions that are not the latest
      rmdir(join(cacheDir, fontID), { recursive: true });
    }
  }
}

/**
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ cachedVariantFiles: number }> {
  try {
    const cacheDir = join(config.CACHE_DIR, CACHE_SUBDIR);

    if (!(await cacheFileExists(cacheDir))) {
      return { cachedVariantFiles: 0 };
    }

    const files = await readdir(cacheDir);
    return { cachedVariantFiles: files.filter((file) => file.endsWith(".json")).length };
  } catch (error) {
    console.error("Error getting cache stats:", error);
    return { cachedVariantFiles: 0 };
  }
}

/**
 * Recursively read all files in a directory
 */
async function getCachedFontVersion(dir: string, folders: Record<string, any> = {}, returnFiles = false): Promise<Record<string, any>> {
  const pathArr = folders || {};

  try {
    const entries = await readdir(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const entryStat = await stat(fullPath);
			let version: string;

      if (entryStat.isDirectory()) {
        const subDir = await readdir(fullPath);
				version = subDir.length === 0 ? "-1" : subDir[0];
        pathArr[entry] = version;
      } else {
        // just skip, we only need directories to determine versions
      }
    }
  } catch (error) {
    // Directory might not exist
    console.warn(`Could not read directory ${dir}:`, error);
  }

  return pathArr;
}
