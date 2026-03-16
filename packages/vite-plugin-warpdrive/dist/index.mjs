import { Buffer } from "node:buffer";
import { readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { cwd } from "node:process";
import { createHash } from "node:crypto";
import { S3mini } from "s3mini";

//#region src/providers/s3.ts
function createS3Provider(options) {
	const client = new S3mini({
		accessKeyId: options.accessKeyId,
		secretAccessKey: options.secretAccessKey,
		endpoint: options.endpoint,
		region: options.region ?? "auto",
		requestAbortTimeout: options.requestAbortTimeout,
		requestSizeInBytes: options.requestSizeInBytes
	});
	const publicBaseUrl = options.publicBaseUrl ?? options.endpoint;
	const skipNotModified = options.skipNotModified !== false;
	return {
		async upload(localPath, key, contentType) {
			const data = await readFile(localPath);
			await client.putObject(normalizeKey(key), data, contentType ?? "application/octet-stream");
		},
		async cleanPrefix(prefix) {
			const normalizedPrefix = normalizePrefix$1(prefix);
			if (!normalizedPrefix) return;
			const objects = await client.listObjects("/", `${normalizedPrefix}/`);
			if (!objects?.length) return;
			const keys = objects.map((obj) => obj.Key);
			await client.deleteObjects(keys);
		},
		async shouldSkipUpload(localPath, key) {
			if (!skipNotModified) return false;
			return isMd5HashMatched(client, key, await readFile(localPath));
		},
		getPublicUrl(key) {
			return joinUrl(publicBaseUrl, key);
		}
	};
}
async function isMd5HashMatched(client, key, data) {
	try {
		const etag = await client.getEtag(normalizeKey(key));
		if (!etag) return false;
		const normalizedEtag = sanitizeEtag(etag);
		if (!normalizedEtag || normalizedEtag.includes("-")) return false;
		const localHash = createHash("md5").update(data).digest("hex");
		return normalizedEtag.toLowerCase() === localHash.toLowerCase();
	} catch {
		return false;
	}
}
function normalizePrefix$1(prefix) {
	return prefix.replace(/^\/*/, "").replace(/\/*$/, "");
}
function normalizeKey(key) {
	return key.replace(/^\/*/, "");
}
function joinUrl(base, path) {
	return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
function sanitizeEtag(etag) {
	return etag.replace(/^"+|"+$/g, "");
}

//#endregion
//#region src/index.ts
function WarpDrivePlugin(options) {
	const include = options.include ?? [];
	const prefix = normalizePrefix(options.prefix ?? "remote-assets");
	const pluginName = "proj-airi-warpdrive";
	const shouldDeleteLocalAsset = options.delete !== false;
	const shouldCleanRemote = options.clean !== false;
	const shouldSkipNotModified = options.skipNotModified !== false;
	const isDryRun = options.dryRun === true;
	const tracked = /* @__PURE__ */ new Map();
	const manifest = [];
	let resolvedConfig;
	let cleanedRemote = false;
	const pendingUploads = [];
	const shouldHandle = (filename, ctx) => {
		if (!include.some((matcher) => {
			if (matcher instanceof RegExp) return matcher.test(filename);
			return matcher(filename);
		})) return false;
		if (options.includeBy) return options.includeBy(filename, ctx);
		return true;
	};
	const renderBuiltUrl = (filename, ctx) => {
		if (!shouldHandle(filename, ctx)) return;
		if (!options.provider) return;
		const key = prefix ? `${prefix}/${filename}` : filename;
		const url = options.provider.getPublicUrl(key);
		tracked.set(filename, {
			key,
			url,
			hostId: ctx.hostId,
			hostType: ctx.hostType
		});
		return url;
	};
	return {
		name: pluginName,
		apply: "build",
		enforce: "post",
		config: () => {
			return { experimental: { renderBuiltUrl } };
		},
		configResolved(config) {
			resolvedConfig = config;
		},
		async generateBundle(_, bundle) {
			if (!resolvedConfig) {
				console.warn?.(`[${pluginName}] Vite config not resolved, skipping upload step`);
				return;
			}
			if (!options.provider) {
				resolvedConfig.logger.warn(`[${pluginName}] no upload provider configured, skipping upload step`);
				return;
			}
			const outDir = resolve(resolvedConfig.root || cwd(), resolvedConfig.build.outDir);
			for (const [fileName, output] of Object.entries(bundle)) {
				if (output.type !== "asset") continue;
				const trackedMeta = tracked.get(fileName);
				if (!trackedMeta) continue;
				const key = trackedMeta.key;
				const url = trackedMeta.url;
				const localPath = join(outDir, fileName);
				const size = getAssetSize(output);
				const contentType = await options.contentTypeBy?.(fileName);
				manifest.push({
					fileName,
					url,
					key,
					hostId: trackedMeta.hostId,
					hostType: trackedMeta.hostType,
					size
				});
				pendingUploads.push({
					fileName,
					key,
					localPath,
					contentType
				});
				resolvedConfig.logger.info(`[${pluginName}] scheduled uploading: ${fileName} -> ${key} (${size} bytes)`);
			}
			if (options.manifest && manifest.length) this.emitFile({
				type: "asset",
				fileName: "remote-assets.manifest.json",
				source: JSON.stringify({ assets: manifest }, null, 2)
			});
		},
		async closeBundle() {
			if (!resolvedConfig) {
				console.warn?.(`[${pluginName}] Vite config not resolved, skipping upload step`);
				return;
			}
			if (!options.provider) {
				resolvedConfig.logger.warn(`[${pluginName}] no upload provider configured, skipping upload step`);
				return;
			}
			if (!pendingUploads.length) return;
			if (isDryRun) {
				resolvedConfig.logger.info(`[${pluginName}] dry run enabled; skipping clean/upload for ${pendingUploads.length} assets`);
				return;
			}
			if (shouldCleanRemote && !cleanedRemote) if (!prefix) resolvedConfig.logger.warn(`[${pluginName}] skipping clean step because no prefix provided`);
			else if (typeof options.provider.cleanPrefix === "function") {
				resolvedConfig.logger.info(`[${pluginName}] cleaning remote prefix: ${prefix}`);
				await options.provider.cleanPrefix(prefix);
				resolvedConfig.logger.info(`[${pluginName}] cleaned remote prefix: ${prefix}`);
				cleanedRemote = true;
			} else resolvedConfig.logger.warn(`[${pluginName}] clean is enabled but provider does not support prefix cleaning; skipping`);
			resolvedConfig.logger.info(`[${pluginName}] uploading ${pendingUploads.length} assets to remote storage...`);
			const uploads = [];
			for (const { fileName, key, localPath, contentType } of pendingUploads) uploads.push((async () => {
				if (shouldSkipNotModified && typeof options.provider.shouldSkipUpload === "function") try {
					if (await options.provider.shouldSkipUpload(localPath, key)) {
						resolvedConfig.logger.info(`[${pluginName}] skipped upload (not modified): ${fileName} -> ${key}`);
						if (shouldDeleteLocalAsset) try {
							await rm(localPath, { force: true });
							resolvedConfig.logger.info(`[${pluginName}] deleted local asset: ${fileName}`);
						} catch (error) {
							resolvedConfig.logger.warn(`[${pluginName}] failed to delete local asset ${fileName}: ${error}`);
						}
						return;
					}
				} catch (error) {
					resolvedConfig.logger.warn(`[${pluginName}] could not determine if upload should be skipped for ${fileName}: ${error}`);
				}
				try {
					await options.provider.upload(localPath, key, contentType);
				} catch (error) {
					resolvedConfig.logger.error(`[${pluginName}] upload failed, file: ${fileName} -> ${key}: ${error}`, { error });
					throw error;
				}
				if (shouldDeleteLocalAsset) try {
					await rm(localPath, { force: true });
					resolvedConfig.logger.info(`[${pluginName}] deleted local asset: ${fileName}`);
				} catch (error) {
					resolvedConfig.logger.warn(`[${pluginName}] failed to delete local asset ${fileName}: ${error}`);
				}
			})());
			await Promise.all(uploads);
			resolvedConfig.logger.info(`[${pluginName}] upload complete`);
		}
	};
}
function normalizePrefix(prefix) {
	return prefix.replace(/^\/*/, "").replace(/\/*$/, "");
}
function getAssetSize(asset) {
	if (typeof asset.source === "string") return Buffer.byteLength(asset.source);
	return asset.source?.byteLength ?? 0;
}

//#endregion
export { WarpDrivePlugin, createS3Provider };
//# sourceMappingURL=index.mjs.map