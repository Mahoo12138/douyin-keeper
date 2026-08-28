const MAX_DEPTH = 8;
const MAX_FIELDS = 4000;
const MAX_MESSAGE_BYTES = 2 * 1024 * 1024;

function readVarint(bytes, offset) {
  let value = 0n;
  let shift = 0n;
  for (let index = offset; index < bytes.length && index < offset + 10; index += 1) {
    const byte = bytes[index];
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, next: index + 1 };
    shift += 7n;
  }
  return null;
}

function utf8Preview(bytes) {
  if (!bytes.length) return { printable: false, text: "" };
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { printable: false, text: "" };
  }
  const printable = [...text].every((char) => {
    const code = char.codePointAt(0);
    return code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127);
  });
  return { printable, text: printable ? text : "" };
}

function isPlausibleMessage(bytes) {
  if (!bytes.length || bytes.length > MAX_MESSAGE_BYTES) return false;
  const parsed = decodeProtobuf(bytes, { depth: 1, maxFields: 80 });
  return parsed.ok && parsed.fields.length > 0;
}

function decodeMessage(bytes, depth, maxFields) {
  const fields = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (fields.length >= maxFields) return { ok: false, reason: "field_limit" };
    const tag = readVarint(bytes, offset);
    if (!tag) return { ok: false, reason: "invalid_tag" };
    offset = tag.next;
    const fieldNumber = Number(tag.value >> 3n);
    const wireType = Number(tag.value & 7n);
    if (!Number.isInteger(fieldNumber) || fieldNumber <= 0 || fieldNumber > 0x1fffffff) {
      return { ok: false, reason: "invalid_field_number" };
    }

    if (wireType === 0) {
      const value = readVarint(bytes, offset);
      if (!value) return { ok: false, reason: "invalid_varint" };
      fields.push({ field: fieldNumber, wire_type: wireType, kind: "varint", value: value.value.toString() });
      offset = value.next;
      continue;
    }

    if (wireType === 1) {
      if (offset + 8 > bytes.length) return { ok: false, reason: "truncated_fixed64" };
      fields.push({ field: fieldNumber, wire_type: wireType, kind: "fixed64", length: 8 });
      offset += 8;
      continue;
    }

    if (wireType === 2) {
      const length = readVarint(bytes, offset);
      if (!length) return { ok: false, reason: "invalid_length" };
      offset = length.next;
      if (length.value > BigInt(bytes.length - offset) || length.value > BigInt(MAX_MESSAGE_BYTES)) {
        return { ok: false, reason: "invalid_length" };
      }
      const end = offset + Number(length.value);
      const value = bytes.subarray(offset, end);
      const preview = utf8Preview(value);
      const field = {
        field: fieldNumber,
        wire_type: wireType,
        kind: preview.printable ? "string" : "bytes",
        length: value.length,
        printable: preview.printable,
      };
      // Keep decoded values on the in-process tree so the caller can perform
      // endpoint-specific correlation. `summarizeProtobuf` deliberately
      // ignores these properties; they must never be written to diagnostics.
      if (preview.printable) field.text = preview.text;
      else field.raw = value;
      if (depth < MAX_DEPTH && !preview.printable && isPlausibleMessage(value)) {
        const nested = decodeMessage(value, depth + 1, Math.min(maxFields, 400));
        if (nested.ok) {
          field.kind = "message";
          field.fields = nested.fields;
        }
      }
      fields.push(field);
      offset = end;
      continue;
    }

    if (wireType === 5) {
      if (offset + 4 > bytes.length) return { ok: false, reason: "truncated_fixed32" };
      fields.push({ field: fieldNumber, wire_type: wireType, kind: "fixed32", length: 4 });
      offset += 4;
      continue;
    }

    return { ok: false, reason: `unsupported_wire_type_${wireType}` };
  }
  return { ok: true, fields };
}

export function decodeProtobuf(input, options = {}) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input || []);
  if (!bytes.length) return { ok: false, reason: "empty" };
  const depth = Number.isInteger(options.depth) ? options.depth : 0;
  const maxFields = Math.min(Number.isInteger(options.maxFields) ? options.maxFields : MAX_FIELDS, MAX_FIELDS);
  if (depth > MAX_DEPTH) return { ok: false, reason: "depth_limit" };
  return decodeMessage(bytes, depth, maxFields);
}

function flattenFields(fields, path = [], out = []) {
  for (const item of fields || []) {
    const nextPath = [...path, item.field];
    out.push({ path: nextPath.join("."), wire_type: item.wire_type, kind: item.kind, length: item.length || 0 });
    if (item.kind === "message") flattenFields(item.fields, nextPath, out);
  }
  return out;
}

export function summarizeProtobuf(decoded) {
  if (!decoded?.ok) return { ok: false, reason: decoded?.reason || "unknown" };
  const fields = flattenFields(decoded.fields);
  const byKind = {};
  const byWireType = {};
  for (const item of fields) {
    byKind[item.kind] = (byKind[item.kind] || 0) + 1;
    byWireType[String(item.wire_type)] = (byWireType[String(item.wire_type)] || 0) + 1;
  }
  return {
    ok: true,
    top_level_field_count: decoded.fields.length,
    decoded_field_count: fields.length,
    field_paths: fields.slice(0, 240).map((item) => item.path),
    kinds: byKind,
    wire_types: byWireType,
    length_stats: lengthStats(fields),
  };
}

function lengthStats(fields) {
  const lengths = fields.map((item) => item.length).filter((value) => value > 0);
  if (!lengths.length) return { count: 0, min: 0, max: 0 };
  return { count: lengths.length, min: Math.min(...lengths), max: Math.max(...lengths) };
}
