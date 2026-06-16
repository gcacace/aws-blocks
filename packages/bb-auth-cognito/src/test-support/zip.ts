// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

/**
 * Minimal PKZIP builder — stored (uncompressed) entries only.
 *
 * Used by `custom-sender-harness.ts` to package the inlined Lambda source
 * into a `.zip` buffer for `CreateFunction.Code.ZipFile`. We avoid pulling
 * in `jszip` / `adm-zip` because:
 *
 * 1. The only caller is an integration-test fixture; keeping the
 *    non-dev dependency graph pristine matters more than the ~30 LOC here.
 * 2. Lambda's `ZipFile` parameter only needs a valid ZIP archive;
 *    compression is optional (Lambda decompresses server-side either way,
 *    and our Lambda source is ~2 KB so "stored" costs nothing).
 *
 * Format reference: PKWARE APPNOTE.TXT — local file header, central
 * directory, end-of-central-directory record. One entry per `Entry`
 * passed in.
 */

import crypto from 'node:crypto';

export interface Entry {
	/** POSIX-style relative path (no leading slash). */
	name: string;
	body: Buffer;
}

/**
 * Build a ZIP archive from the entries. Returns a single Buffer that
 * Lambda's `CreateFunctionCommand` accepts as `Code.ZipFile`.
 */
export function buildZip(entries: Entry[]): Buffer {
	const chunks: Buffer[] = [];
	const centralEntries: Buffer[] = [];
	let offset = 0;

	for (const entry of entries) {
		const nameBuf = Buffer.from(entry.name, 'utf8');
		const data = entry.body;
		const crc = crc32(data);

		// Local file header — PKWARE §4.3.7
		const local = Buffer.alloc(30);
		local.writeUInt32LE(0x04034b50, 0); // signature
		local.writeUInt16LE(20, 4);          // version needed
		local.writeUInt16LE(0, 6);           // general purpose bit flag
		local.writeUInt16LE(0, 8);           // compression method (0 = stored)
		local.writeUInt16LE(0, 10);          // last mod time (irrelevant for Lambda)
		local.writeUInt16LE(0, 12);          // last mod date
		local.writeUInt32LE(crc, 14);        // CRC-32
		local.writeUInt32LE(data.length, 18); // compressed size
		local.writeUInt32LE(data.length, 22); // uncompressed size
		local.writeUInt16LE(nameBuf.length, 26);
		local.writeUInt16LE(0, 28);          // extra field length
		chunks.push(local, nameBuf, data);

		// Central directory header — PKWARE §4.3.12
		const central = Buffer.alloc(46);
		central.writeUInt32LE(0x02014b50, 0); // signature
		central.writeUInt16LE(20, 4);          // version made by
		central.writeUInt16LE(20, 6);          // version needed
		central.writeUInt16LE(0, 8);
		central.writeUInt16LE(0, 10);
		central.writeUInt16LE(0, 12);
		central.writeUInt16LE(0, 14);
		central.writeUInt32LE(crc, 16);
		central.writeUInt32LE(data.length, 20);
		central.writeUInt32LE(data.length, 24);
		central.writeUInt16LE(nameBuf.length, 28);
		central.writeUInt16LE(0, 30);         // extra field
		central.writeUInt16LE(0, 32);         // comment
		central.writeUInt16LE(0, 34);         // disk number
		central.writeUInt16LE(0, 36);         // internal attrs
		// External file attributes: upper 16 bits = POSIX mode (regular file,
		// 0644). `0o100644 << 16` overflows JS's signed-32-bit bitwise semantics
		// into a negative number, which `writeUInt32LE` rejects — force
		// unsigned with `>>> 0`.
		central.writeUInt32LE((0o100644 << 16) >>> 0, 38);
		central.writeUInt32LE(offset, 42);    // local header offset
		centralEntries.push(Buffer.concat([central, nameBuf]));

		offset += local.length + nameBuf.length + data.length;
	}

	const centralSize = centralEntries.reduce((n, b) => n + b.length, 0);
	const centralOffset = offset;

	// End of central directory record — PKWARE §4.3.16
	const end = Buffer.alloc(22);
	end.writeUInt32LE(0x06054b50, 0);
	end.writeUInt16LE(0, 4);                // disk number
	end.writeUInt16LE(0, 6);                // central dir start disk
	end.writeUInt16LE(entries.length, 8);    // entries on this disk
	end.writeUInt16LE(entries.length, 10);   // total entries
	end.writeUInt32LE(centralSize, 12);
	end.writeUInt32LE(centralOffset, 16);
	end.writeUInt16LE(0, 20);                // comment length

	return Buffer.concat([...chunks, ...centralEntries, end]);
}

/**
 * CRC-32 (IEEE polynomial, reflected). Node doesn't expose CRC-32 on
 * `crypto`, but we can compute it with a table in ~15 LOC. Used only for
 * the ZIP per-entry checksum — Lambda rejects archives with wrong CRCs.
 */
function crc32(data: Buffer): number {
	if (!crcTable) crcTable = makeCrcTable();
	let crc = 0xffffffff;
	for (const b of data) crc = (crc >>> 8) ^ crcTable[(crc ^ b) & 0xff]!;
	return (crc ^ 0xffffffff) >>> 0;
}

let crcTable: Uint32Array | null = null;
function makeCrcTable(): Uint32Array {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let c = i;
		for (let k = 0; k < 8; k++) {
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		}
		table[i] = c >>> 0;
	}
	return table;
}

// Silence "unused import" on strict lint — `crypto` is imported for
// potential future hashing needs but the module currently only uses the
// hand-rolled CRC table. Keeping it here so a follow-up that signs ZIP
// entries doesn't have to reach for another import.
void crypto;
