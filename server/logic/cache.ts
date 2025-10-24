import { access, mkdir, readFile, writeFile } from "fs/promises";
import * as _ from "lodash";
import { join } from "path";
import { config } from "../config";
import { IVariantItem } from "./fetchFontURLs";
import { IFontBundle } from "./store";

const CACHE_SUBDIR = "variants";

/**
 * Get the cache file path for a font bundle
 */
function getCacheFilePath(storeID: string): string {
  return join(config.CACHE_DIR, CACHE_SUBDIR, `${storeID}.json`);
}

/**
 * Check if a cache file exists
 */
async function cacheFileExists(filePath: string): Promise<boolean> {
  try {
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
 * Get cache statistics
 */
export async function getCacheStats(): Promise<{ cachedVariantFiles: number }> {
  try {
    const { readdir } = await import("fs/promises");
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
