import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { deflateRawSync, inflateRawSync } from "node:zlib";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(rootDir, "public");
const dataDir = process.env.DATA_DIR ? normalize(process.env.DATA_DIR) : join(rootDir, "data");
const dbPath = join(dataDir, "db.json");
const invoiceTemplatePath = join(dataDir, "invoice-template.xlsx");
const undoWindowMs = 30_000;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

function nowIso() {
  return new Date().toISOString();
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function tokyoDate(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function hashPassword(password, salt = randomUUID()) {
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const actual = Buffer.from(scryptSync(password, salt, 32).toString("hex"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function id(prefix) {
  return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
}

function seedDb() {
  const adminId = "usr_admin";
  const memberA = "usr_a";
  const memberB = "usr_b";
  const childB = "usr_b_child";
  const memberC = "usr_c";
  const siteA = "site_a";
  const siteB = "site_b";
  const siteC = "site_c";
  const sitePending = "site_pending";
  const today = new Date();
  const base = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1, 0, 0, 0));
  const shifts = [];

  for (let day = 1; day <= 20; day += 1) {
    const date = addDays(base, day);
    const userIds = [memberA, memberB, childB, memberC];
    const siteIds = [siteA, siteB, siteC];
    shifts.push({
      id: id("shf"),
      userId: userIds[day % userIds.length],
      siteId: siteIds[day % siteIds.length],
      startAt: addDays(date, 0).toISOString().replace("T00:00:00.000Z", "T00:00:00.000Z"),
      endAt: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 9, 0, 0)).toISOString(),
      unitPriceOverride: null,
      status: "scheduled",
      memo: day % 4 === 0 ? "希望休確認済み" : "",
      createdBy: adminId,
      bulkOperationId: null,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }

  return {
    sessions: [],
    users: [
      {
        id: adminId,
        name: "管理者",
        email: "admin@example.com",
        passwordHash: hashPassword("password"),
        role: "admin",
        employmentType: "employee",
        parentUserId: null,
        defaultUnitPrice: 30000,
      parentVisibleUnitPrice: null,
      hourlyRate: null,
      monthlySalary: null,
      invoiceNumber: "",
      iconDataUrl: "",
        isActive: true,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: memberA,
        name: "佐藤 一郎",
        email: "sato@example.com",
        passwordHash: hashPassword("password"),
        role: "member",
        employmentType: "contractor",
        parentUserId: null,
        defaultUnitPrice: 22000,
      parentVisibleUnitPrice: null,
      hourlyRate: null,
      monthlySalary: null,
      invoiceNumber: "T1234567890123",
      iconDataUrl: "",
        isActive: true,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: memberB,
        name: "田中 花子",
        email: "tanaka@example.com",
        passwordHash: hashPassword("password"),
        role: "member",
        employmentType: "part_time",
        parentUserId: memberA,
        defaultUnitPrice: 19000,
      parentVisibleUnitPrice: 22000,
      hourlyRate: 1500,
      monthlySalary: null,
      invoiceNumber: "",
      iconDataUrl: "",
        isActive: true,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: childB,
        name: "鈴木 次郎",
        email: "suzuki@example.com",
        passwordHash: hashPassword("password"),
        role: "member",
        employmentType: "contractor",
        parentUserId: memberB,
        defaultUnitPrice: 18000,
      parentVisibleUnitPrice: 19000,
      hourlyRate: null,
      monthlySalary: null,
      invoiceNumber: "T9999999999999",
      iconDataUrl: "",
        isActive: true,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: memberC,
        name: "山本 美咲",
        email: "yamamoto@example.com",
        passwordHash: hashPassword("password"),
        role: "member",
        employmentType: "employee",
        parentUserId: null,
        defaultUnitPrice: 21000,
      parentVisibleUnitPrice: null,
      hourlyRate: null,
      monthlySalary: null,
      invoiceNumber: "",
      iconDataUrl: "",
        isActive: true,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
    userPermissions: [
      { id: id("per"), userId: memberA, permissionKey: "work_visibility_scope", value: "children" },
      { id: id("per"), userId: memberA, permissionKey: "can_view_project_unit_price", value: false },
      { id: id("per"), userId: memberA, permissionKey: "can_create_invoice", value: false },
    ],
    sites: [
      {
        id: siteA,
        name: "渋谷イベント会場",
        clientCompany: "株式会社サンプル",
        address: "東京都渋谷区道玄坂1-1",
        nearestStation: "渋谷",
        projectUnitPrice: 45000,
        memo: "大型案件",
        status: "approved",
        requestedBy: adminId,
        approvedBy: adminId,
        approvedAt: nowIso(),
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: siteB,
        name: "新宿販売ブース",
        clientCompany: "合同会社マーケット",
        address: "東京都新宿区西新宿1-1",
        nearestStation: "新宿",
        projectUnitPrice: 38000,
        memo: "",
        status: "approved",
        requestedBy: adminId,
        approvedBy: adminId,
        approvedAt: nowIso(),
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: siteC,
        name: "名古屋展示会",
        clientCompany: "中部企画株式会社",
        address: "愛知県名古屋市中村区名駅1-1",
        nearestStation: "名古屋",
        projectUnitPrice: 52000,
        memo: "",
        status: "approved",
        requestedBy: adminId,
        approvedBy: adminId,
        approvedAt: nowIso(),
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
      {
        id: sitePending,
        name: "横浜催事場",
        clientCompany: "承認待ち",
        address: "神奈川県横浜市西区",
        nearestStation: "横浜",
        projectUnitPrice: null,
        memo: "一般ユーザー申請",
        status: "pending",
        requestedBy: memberA,
        approvedBy: null,
        approvedAt: null,
        deletedAt: null,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      },
    ],
    shifts,
    holidayRequests: [
      { id: id("hol"), userId: memberA, date: tokyoDate(addDays(base, 5)), reason: "私用", status: "pending", reviewedBy: null, reviewedAt: null, createdAt: nowIso(), updatedAt: nowIso() },
      { id: id("hol"), userId: memberB, date: tokyoDate(addDays(base, 8)), reason: "通院", status: "approved", reviewedBy: adminId, reviewedAt: nowIso(), createdAt: nowIso(), updatedAt: nowIso() },
      { id: id("hol"), userId: memberC, date: tokyoDate(addDays(base, 12)), reason: "家族都合", status: "pending", reviewedBy: null, reviewedAt: null, createdAt: nowIso(), updatedAt: nowIso() },
    ],
    attendances: [],
    auditLogs: [],
    undoDeletes: [],
  };
}

async function loadDb() {
  if (!existsSync(dataDir)) await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    const db = seedDb();
    ensureCollections(db);
    await saveDb(db);
    return db;
  }
  const db = JSON.parse(await readFile(dbPath, "utf8"));
  ensureCollections(db);
  return db;
}

async function saveDb(db) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dbPath, JSON.stringify(db, null, 2), "utf8");
}

function ensureCollections(db) {
  db.announcements ??= [];
  db.calendarEvents ??= [];
  db.lineGroups ??= [];
  db.chatThreads ??= [];
  db.chatMessages ??= [];
  db.chatTasks ??= [];
  for (const task of db.chatTasks) {
    if (task.status === "confirmed") task.status = "done";
  }
  db.attendances ??= [];
  db.auditLogs ??= [];
  db.undoDeletes ??= [];
  for (const user of db.users ?? []) {
    user.monthlySalary ??= null;
    user.iconDataUrl = normalizeIconDataUrl(user.iconDataUrl);
  }
  for (const announcement of db.announcements ?? []) {
    announcement.tags ??= [];
  }
  for (const event of db.calendarEvents ?? []) {
    event.tags ??= [];
    event.visibility ??= "private";
  }
  if (!db.lineGroups.length) {
    db.lineGroups.push({
      id: "line_group_default",
      name: "全体連絡グループ",
      webhookUrl: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
  if (!db.chatThreads.length && db.users?.length) {
    const activeUsers = db.users.filter((user) => user.isActive && !user.deletedAt);
    const admin = activeUsers.find((user) => user.role === "admin") ?? activeUsers[0];
    const members = activeUsers.filter((user) => user.id !== admin?.id).slice(0, 3);
    if (admin && members[0]) {
      db.chatThreads.push({
        id: "chat_direct_sample",
        type: "direct",
        name: `${admin.name} / ${members[0].name}`,
        participantIds: [admin.id, members[0].id],
        tags: [],
        deletedAt: null,
        createdBy: admin.id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
    if (activeUsers.length > 1) {
      db.chatThreads.push({
        id: "chat_group_all",
        type: "group",
        name: "全体共有",
        participantIds: activeUsers.map((user) => user.id),
        tags: [],
        deletedAt: null,
        createdBy: admin?.id ?? activeUsers[0].id,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
    }
  }
}

function publicUser(db, viewer, user) {
  const visibleUnitPrice = getVisibleUnitPriceFor(db, viewer, user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    employmentType: user.employmentType,
    parentUserId: user.parentUserId,
    visibleUnitPrice,
    hourlyRate: viewer.role === "admin" || viewer.id === user.id || user.parentUserId === viewer.id ? user.hourlyRate : null,
    monthlySalary: viewer.role === "admin" || viewer.id === user.id || user.parentUserId === viewer.id ? user.monthlySalary ?? null : null,
    invoiceNumber: user.invoiceNumber,
    iconDataUrl: user.iconDataUrl || "",
    isActive: user.isActive,
    canEdit: canManageUser(viewer, user),
    createdAt: user.createdAt,
  };
}

function getPermission(db, userId, key, fallback = null) {
  const row = db.userPermissions.find((item) => item.userId === userId && item.permissionKey === key);
  return row ? row.value : fallback;
}

function permissionMap(db, userId) {
  return Object.fromEntries(db.userPermissions.filter((item) => item.userId === userId).map((item) => [item.permissionKey, item.value]));
}

function setPermission(db, userId, key, value) {
  const existing = db.userPermissions.find((item) => item.userId === userId && item.permissionKey === key);
  if (existing) {
    existing.value = value;
    existing.updatedAt = nowIso();
    return existing;
  }
  const created = { id: id("per"), userId, permissionKey: key, value, createdAt: nowIso(), updatedAt: nowIso() };
  db.userPermissions.push(created);
  return created;
}

function canViewUser(db, viewer, target) {
  if (!viewer || !target || target.deletedAt) return false;
  if (viewer.role === "admin") return true;
  if (viewer.id === target.id) return true;
  if (target.parentUserId === viewer.id) return true;
  return getPermission(db, viewer.id, "work_visibility_scope") === "all";
}

function canManageUser(viewer, target) {
  if (!viewer || !target) return false;
  return viewer.role === "admin";
}

function getVisibleUnitPriceFor(db, viewer, target) {
  if (!viewer || !target) return null;
  if (viewer.role === "admin") return target.defaultUnitPrice;
  if (viewer.id === target.id) return target.defaultUnitPrice;
  if (target.parentUserId === viewer.id) return target.parentVisibleUnitPrice;
  return null;
}

function canManageShift(db, viewer, shift) {
  if (!viewer || !shift || shift.deletedAt) return false;
  if (viewer.role === "admin") return true;
  const owner = db.users.find((user) => user.id === shift.userId);
  return shift.userId === viewer.id || owner?.parentUserId === viewer.id;
}

function canUseSite(viewer, site) {
  if (!viewer || !site || site.deletedAt) return false;
  if (viewer.role === "admin") return true;
  return site.status === "approved" || site.requestedBy === viewer.id;
}

function audit(db, viewer, action, targetTable, targetId, before, after) {
  db.auditLogs.unshift({
    id: id("aud"),
    userId: viewer?.id ?? null,
    action,
    targetTable,
    targetId,
    before,
    after,
    createdAt: nowIso(),
  });
}

function statusCode(status) {
  return {
    scheduled: "稼働前",
    clocked_in: "出勤",
    clocked_out: "出勤",
    late_clock_in: "遅刻",
    late_clock_out: "遅刻",
    cancelled: "欠勤",
  }[status] ?? status;
}

function applyAttendanceStatus(db, shift, at = new Date()) {
  if (!shift || shift.deletedAt || shift.status === "clocked_in" || shift.status === "clocked_out") return false;
  const attendance = db.attendances.find((item) => item.shiftId === shift.id);
  if (attendance?.clockInAt) return false;
  const startAt = new Date(shift.startAt);
  const endAt = new Date(shift.endAt);
  const nextStatus = at > endAt ? "cancelled" : at > startAt ? "late_clock_in" : "scheduled";
  if (shift.status === nextStatus) return false;
  shift.status = nextStatus;
  shift.updatedAt = nowIso();
  return true;
}

function enrichShift(db, viewer, shift) {
  const user = db.users.find((item) => item.id === shift.userId);
  const site = db.sites.find((item) => item.id === shift.siteId);
  const attendance = db.attendances.find((item) => item.shiftId === shift.id);
  return {
    ...shift,
    userName: user?.name ?? "不明",
    siteName: site?.name ?? "不明",
    statusLabel: statusCode(shift.status),
    visibleUnitPrice: shift.unitPriceOverride ?? getVisibleUnitPriceFor(db, viewer, user),
    attendance,
  };
}

function visibleUsers(db, viewer) {
  return db.users.filter((user) => canViewUser(db, viewer, user)).map((user) => publicUser(db, viewer, user));
}

function isHolidayConflict(db, userId, startAt) {
  const date = tokyoDate(new Date(startAt));
  return db.holidayRequests.some((item) => item.userId === userId && item.date === date && item.status === "approved");
}

async function bodyJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function send(res, status, payload, headers = {}) {
  const text = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(text);
}

function sendError(res, status, message) {
  send(res, status, { error: message });
}

function xmlEscape(value) {
  return String(value ?? "").replace(/[<>&"']/g, (char) => ({
    "<": "&lt;",
    ">": "&gt;",
    "&": "&amp;",
    '"': "&quot;",
    "'": "&apos;",
  }[char]));
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function readZipEntries(buffer) {
  const readU16 = (offset) => buffer.readUInt16LE(offset);
  const readU32 = (offset) => buffer.readUInt32LE(offset);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (readU32(offset) === 0x06054b50) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) throw new Error("Excelテンプレートを読み込めません。");
  const total = readU16(eocd + 10);
  let offset = readU32(eocd + 16);
  const entries = [];
  for (let index = 0; index < total; index += 1) {
    if (readU32(offset) !== 0x02014b50) throw new Error("Excelテンプレートを解析できません。");
    const method = readU16(offset + 10);
    const compressedSize = readU32(offset + 20);
    const nameLength = readU16(offset + 28);
    const extraLength = readU16(offset + 30);
    const commentLength = readU16(offset + 32);
    const localOffset = readU32(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = readU16(localOffset + 26);
    const localExtraLength = readU16(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    const data = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.push({ name, data });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function writeZipEntries(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(0, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function replaceCell(sheetXml, ref, value, kind = "string") {
  const pattern = new RegExp(`<c r="${ref}"([^>]*)>[\\s\\S]*?<\\/c>`);
  const current = sheetXml.match(pattern);
  const attrs = (current?.[1] ?? "").replace(/\st="[^"]*"/g, "").replace(/\s?cm="[^"]*"/g, "").replace(/\s?vm="[^"]*"/g, "");
  const text = kind === "number"
    ? `<c r="${ref}"${attrs}><v>${Number(value || 0)}</v></c>`
    : `<c r="${ref}"${attrs} t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
  return current ? sheetXml.replace(pattern, text) : sheetXml;
}

function replaceNumberValue(sheetXml, ref, value) {
  const pattern = new RegExp(`<c r="${ref}"[^>]*>[\\s\\S]*?<\\/c>`);
  const current = sheetXml.match(pattern);
  if (!current) return sheetXml;
  const cell = current[0];
  const number = Number(value || 0);
  const nextCell = cell.includes("<v>")
    ? cell.replace(/<v>[\s\S]*?<\/v>/, `<v>${number}</v>`)
    : cell.replace("</c>", `<v>${number}</v></c>`);
  return sheetXml.replace(pattern, nextCell);
}

function visibleInvoiceShifts(db, viewer) {
  return db.shifts
    .filter((shift) => !shift.deletedAt && shift.status !== "cancelled" && canManageShift(db, viewer, shift))
    .slice(0, 16);
}

function invoiceLine(db, viewer, shift, index) {
  const user = db.users.find((item) => item.id === shift.userId);
  const site = db.sites.find((item) => item.id === shift.siteId);
  const unitPrice = shift.unitPriceOverride ?? getVisibleUnitPriceFor(db, viewer, user) ?? 0;
  return {
    no: index + 1,
    description: `${site?.name ?? "現場"} ${tokyoDate(new Date(shift.startAt))}\n${user?.name ?? "担当者"}`,
    quantity: 1,
    unit: "日",
    unitPrice,
    amount: unitPrice,
  };
}

async function buildInvoiceXlsx(db, viewer) {
  const template = await readFile(invoiceTemplatePath);
  const entries = readZipEntries(template);
  const sheetEntry = entries.find((entry) => entry.name === "xl/worksheets/sheet2.xml");
  if (!sheetEntry) throw new Error("請求書シートが見つかりません。");
  const shifts = visibleInvoiceShifts(db, viewer);
  const lines = shifts.map((shift, index) => invoiceLine(db, viewer, shift, index));
  let sheet = sheetEntry.data.toString("utf8");
  for (let row = 19; row <= 34; row += 1) {
    const line = lines[row - 19];
    sheet = replaceNumberValue(sheet, `C${row}`, line ? line.quantity : 0);
    sheet = replaceNumberValue(sheet, `R${row}`, line ? line.unitPrice : 0);
    sheet = replaceNumberValue(sheet, `S${row}`, line ? line.amount : 0);
  }
  sheetEntry.data = Buffer.from(sheet, "utf8");
  return writeZipEntries(entries);
}

function pdfText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/[\\()]/g, "\\$&");
}

function buildPdf(lines) {
  const content = [
    "BT",
    "/F1 18 Tf",
    "50 790 Td",
    `(Invoice Preview) Tj`,
    "/F1 10 Tf",
    ...lines.flatMap((line, index) => [
      index === 0 ? "0 -26 Td" : "0 -16 Td",
      `(${pdfText(line).slice(0, 92)}) Tj`,
    ]),
    "ET",
  ].join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`,
  ];
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(parts.join(""), "utf8"));
    parts.push(`${index + 1} 0 obj\n${objects[index]}\nendobj\n`);
  }
  const xrefOffset = Buffer.byteLength(parts.join(""), "utf8");
  parts.push(`xref\n0 ${objects.length + 1}\n`);
  parts.push("0000000000 65535 f \n");
  for (let index = 1; index < offsets.length; index += 1) {
    parts.push(`${String(offsets[index]).padStart(10, "0")} 00000 n \n`);
  }
  parts.push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);
  return Buffer.from(parts.join(""), "utf8");
}

function buildInvoicePdf(db, viewer) {
  const lines = visibleInvoiceShifts(db, viewer).map((shift, index) => invoiceLine(db, viewer, shift, index));
  const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
  const tax = Math.round(subtotal * 0.1);
  return buildPdf([
    `Date: ${tokyoDate(new Date())}`,
    `Items: ${lines.length}`,
    ...lines.slice(0, 18).map((line) => `${line.no}. ${line.description.replace(/\n/g, " / ")}  ${line.amount.toLocaleString("ja-JP")} JPY`),
    `Subtotal: ${subtotal.toLocaleString("ja-JP")} JPY`,
    `Tax: ${tax.toLocaleString("ja-JP")} JPY`,
    `Total: ${(subtotal + tax).toLocaleString("ja-JP")} JPY`,
  ]);
}

function chatUserName(db, userId) {
  return db.users.find((user) => user.id === userId)?.name ?? "不明";
}

function canUseChatThread(viewer, thread) {
  return !thread?.deletedAt && (viewer.role === "admin" || thread.participantIds?.includes(viewer.id));
}

function publicChatThread(db, thread) {
  return {
    ...thread,
    tags: thread.tags ?? [],
    participantNames: (thread.participantIds ?? []).map((userId) => chatUserName(db, userId)),
    participants: (thread.participantIds ?? []).map((userId) => {
      const user = db.users.find((item) => item.id === userId);
      return { id: userId, name: user?.name ?? "不明", iconDataUrl: user?.iconDataUrl || "" };
    }),
  };
}

function publicChatMessage(db, message) {
  return {
    ...message,
    senderName: chatUserName(db, message.senderId),
  };
}

function publicChatTask(db, task) {
  return {
    ...task,
    requesterName: chatUserName(db, task.requesterId),
    assigneeName: chatUserName(db, task.assigneeId),
  };
}

function publicAnnouncement(db, announcement) {
  return {
    ...announcement,
    tags: announcement.tags ?? [],
    authorName: chatUserName(db, announcement.authorId),
    lineGroupName: db.lineGroups.find((group) => group.id === announcement.lineGroupId)?.name ?? "",
  };
}

function canViewCalendarEvent(viewer, event) {
  if (!viewer || !event || event.deletedAt) return false;
  return event.visibility === "public" || event.createdBy === viewer.id || viewer.role === "admin";
}

function publicCalendarEvent(db, event) {
  const author = db.users.find((user) => user.id === event.createdBy);
  return {
    ...event,
    tags: event.tags ?? [],
    authorName: author?.name ?? "不明",
  };
}

async function notifyLineGroup(group, announcement, author) {
  if (!group?.webhookUrl) {
    return { status: "skipped", message: "LINE通知先が未設定です。" };
  }
  const text = `【お知らせ】${announcement.title}\n投稿者: ${author.name}\n${announcement.body}`;
  try {
    const response = await fetch(group.webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, message: text }),
    });
    if (!response.ok) return { status: "failed", message: `LINE通知に失敗しました: ${response.status}` };
    return { status: "sent", message: "LINE通知を送信しました。" };
  } catch (error) {
    return { status: "failed", message: error.message };
  }
}

function parseCookies(req) {
  return Object.fromEntries((req.headers.cookie ?? "").split(";").filter(Boolean).map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("="))];
  }));
}

function setSessionCookie(token) {
  return `session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
}

function clearSessionCookie() {
  return "session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
}

async function currentUser(db, req) {
  const token = parseCookies(req).session;
  if (!token) return null;
  const session = db.sessions.find((item) => item.token === token && new Date(item.expiresAt) > new Date());
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId && user.isActive && !user.deletedAt) ?? null;
}

async function routeApi(req, res, db, pathname, method) {
  if (pathname === "/api/auth/login" && method === "POST") {
    const body = await bodyJson(req);
    const user = db.users.find((item) => item.email === body.email && item.isActive && !item.deletedAt);
    if (!user || !verifyPassword(body.password ?? "", user.passwordHash)) return sendError(res, 401, "メールアドレスまたはパスワードが違います。");
    const token = randomUUID();
    db.sessions.push({ token, userId: user.id, expiresAt: addDays(new Date(), 7).toISOString(), createdAt: nowIso() });
    audit(db, user, "login", "users", user.id, null, { email: user.email });
    await saveDb(db);
    return send(res, 200, { user: publicUser(db, user, user) }, { "set-cookie": setSessionCookie(token) });
  }

  const viewer = await currentUser(db, req);
  if (!viewer) return sendError(res, 401, "ログインしてください。");

  if (pathname === "/api/auth/logout" && method === "POST") {
    const token = parseCookies(req).session;
    db.sessions = db.sessions.filter((item) => item.token !== token);
    audit(db, viewer, "logout", "users", viewer.id, null, null);
    await saveDb(db);
    return send(res, 200, { ok: true }, { "set-cookie": clearSessionCookie() });
  }

  if (pathname === "/api/auth/me" && method === "GET") {
    return send(res, 200, { user: publicUser(db, viewer, viewer), permissions: db.userPermissions.filter((item) => item.userId === viewer.id) });
  }

  if (pathname === "/api/announcements" && method === "GET") {
    const announcements = db.announcements
      .filter((announcement) => !announcement.deletedAt)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((announcement) => publicAnnouncement(db, announcement));
    return send(res, 200, { announcements });
  }

  if (pathname === "/api/announcements" && method === "POST") {
    const body = await bodyJson(req);
    const announcement = {
      id: id("ann"),
      title: String(body.title ?? "").trim(),
      body: String(body.body ?? "").trim(),
      authorId: viewer.id,
      lineGroupId: body.lineGroupId || "",
      tags: normalizeTags(body.tags),
      lineStatus: "none",
      lineMessage: "",
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!announcement.title || !announcement.body) return sendError(res, 422, "タイトルと本文を入力してください。");
    const lineGroup = db.lineGroups.find((group) => group.id === announcement.lineGroupId);
    if (lineGroup) {
      const lineResult = await notifyLineGroup(lineGroup, announcement, viewer);
      announcement.lineStatus = lineResult.status;
      announcement.lineMessage = lineResult.message;
    }
    db.announcements.unshift(announcement);
    audit(db, viewer, "create", "announcements", announcement.id, null, announcement);
    await saveDb(db);
    return send(res, 201, { announcement: publicAnnouncement(db, announcement) });
  }

  const announcementMatch = pathname.match(/^\/api\/announcements\/([^/]+)$/);
  if (announcementMatch && method === "DELETE") {
    const announcement = db.announcements.find((item) => item.id === announcementMatch[1] && !item.deletedAt);
    if (!announcement) return sendError(res, 404, "お知らせが見つかりません。");
    if (viewer.role !== "admin" && announcement.authorId !== viewer.id) return sendError(res, 403, "このお知らせは削除できません。");
    const before = { ...announcement };
    announcement.deletedAt = nowIso();
    announcement.updatedAt = nowIso();
    audit(db, viewer, "delete", "announcements", announcement.id, before, announcement);
    await saveDb(db);
    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/calendar-events" && method === "GET") {
    const events = db.calendarEvents
      .filter((event) => canViewCalendarEvent(viewer, event))
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
      .map((event) => publicCalendarEvent(db, event));
    return send(res, 200, { events });
  }

  if (pathname === "/api/calendar-events" && method === "POST") {
    const body = await bodyJson(req);
    const startAt = new Date(body.startAt);
    if (Number.isNaN(startAt.getTime())) return sendError(res, 422, "開始日時を入力してください。");
    const endAt = body.endAt ? new Date(body.endAt) : new Date(startAt.getTime() + 60 * 60 * 1000);
    if (Number.isNaN(endAt.getTime()) || endAt <= startAt) return sendError(res, 422, "終了日時は開始日時より後にしてください。");
    const event = {
      id: id("cal"),
      title: String(body.title ?? "").trim(),
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      visibility: body.visibility === "public" ? "public" : "private",
      tags: normalizeTags(body.tags),
      createdBy: viewer.id,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!event.title) return sendError(res, 422, "予定名を入力してください。");
    db.calendarEvents.push(event);
    audit(db, viewer, "create", "calendarEvents", event.id, null, event);
    await saveDb(db);
    return send(res, 201, { event: publicCalendarEvent(db, event) });
  }

  if (pathname === "/api/line-groups" && method === "GET") {
    const groups = db.lineGroups.map((group) => ({
      id: group.id,
      name: group.name,
      hasWebhook: Boolean(group.webhookUrl),
      canEdit: viewer.role === "admin",
    }));
    return send(res, 200, { groups });
  }

  if (pathname === "/api/line-groups" && method === "POST") {
    if (viewer.role !== "admin") return sendError(res, 403, "LINE通知先を登録できるのは管理者のみです。");
    const body = await bodyJson(req);
    const group = {
      id: id("line"),
      name: String(body.name ?? "").trim(),
      webhookUrl: String(body.webhookUrl ?? "").trim(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!group.name) return sendError(res, 422, "グループ名を入力してください。");
    db.lineGroups.push(group);
    audit(db, viewer, "create", "line_groups", group.id, null, { id: group.id, name: group.name });
    await saveDb(db);
    return send(res, 201, { group: { id: group.id, name: group.name, hasWebhook: Boolean(group.webhookUrl), canEdit: true } });
  }

  if (pathname === "/api/invoices/export-excel" && method === "GET") {
    const file = await buildInvoiceXlsx(db, viewer);
    const filename = encodeURIComponent(`請求書_${tokyoDate(new Date()).replaceAll("-", "")}.xlsx`);
    res.writeHead(200, {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${filename}`,
      "content-length": file.length,
    });
    res.end(file);
    return;
  }

  if (pathname === "/api/invoices/save-excel" && method === "POST") {
    const file = await buildInvoiceXlsx(db, viewer);
    const outputPath = join(dataDir, "generated-invoice.xlsx");
    await writeFile(outputPath, file);
    return send(res, 200, { ok: true, path: outputPath });
  }

  if (pathname === "/api/invoices/export-pdf" && method === "GET") {
    const file = buildInvoicePdf(db, viewer);
    const filename = encodeURIComponent(`請求書_${tokyoDate(new Date()).replaceAll("-", "")}.pdf`);
    res.writeHead(200, {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename*=UTF-8''${filename}`,
      "content-length": file.length,
    });
    res.end(file);
    return;
  }

  if (pathname === "/api/invoices/save-pdf" && method === "POST") {
    const file = buildInvoicePdf(db, viewer);
    const outputPath = join(dataDir, "generated-invoice.pdf");
    await writeFile(outputPath, file);
    return send(res, 200, { ok: true, path: outputPath });
  }

  if (pathname === "/api/chat/threads" && method === "GET") {
    const threads = db.chatThreads.filter((thread) => canUseChatThread(viewer, thread)).map((thread) => publicChatThread(db, thread));
    return send(res, 200, { threads });
  }

  if (pathname === "/api/chat/threads" && method === "POST") {
    const body = await bodyJson(req);
    const participantIds = Array.from(new Set([viewer.id, ...(body.participantIds ?? [])]))
      .filter((userId) => db.users.some((user) => user.id === userId && user.isActive && !user.deletedAt));
    if (participantIds.length < 2) return sendError(res, 422, "チャット相手を選択してください。");
    const thread = {
      id: id("cht"),
      type: body.type === "group" ? "group" : "direct",
      name: String(body.name || "").trim() || (body.type === "group" ? "グループチャット" : participantIds.map((userId) => chatUserName(db, userId)).join(" / ")),
      participantIds,
      tags: (body.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8),
      deletedAt: null,
      createdBy: viewer.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.chatThreads.unshift(thread);
    await saveDb(db);
    return send(res, 201, { thread: publicChatThread(db, thread) });
  }

  const chatThreadMatch = pathname.match(/^\/api\/chat\/threads\/([^/]+)$/);
  if (chatThreadMatch && method === "PATCH") {
    const thread = db.chatThreads.find((item) => item.id === chatThreadMatch[1]);
    if (!thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "チャットが見つかりません。");
    const body = await bodyJson(req);
    if (body.tags !== undefined) {
      thread.tags = (body.tags ?? []).map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8);
    }
    if (body.name !== undefined) thread.name = String(body.name).trim() || thread.name;
    thread.updatedAt = nowIso();
    await saveDb(db);
    return send(res, 200, { thread: publicChatThread(db, thread) });
  }

  if (chatThreadMatch && method === "DELETE") {
    const thread = db.chatThreads.find((item) => item.id === chatThreadMatch[1]);
    if (!thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "チャットが見つかりません。");
    thread.deletedAt = nowIso();
    thread.updatedAt = nowIso();
    await saveDb(db);
    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/chat/messages" && method === "GET") {
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const thread = db.chatThreads.find((item) => item.id === params.get("threadId"));
    if (!thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "チャットが見つかりません。");
    const messages = db.chatMessages
      .filter((message) => message.threadId === thread.id)
      .slice(-80)
      .map((message) => publicChatMessage(db, message));
    const tasks = db.chatTasks
      .filter((task) => task.threadId === thread.id)
      .map((task) => publicChatTask(db, task));
    return send(res, 200, { messages, tasks });
  }

  if (pathname === "/api/chat/messages" && method === "POST") {
    const body = await bodyJson(req);
    const thread = db.chatThreads.find((item) => item.id === body.threadId);
    if (!thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "チャットが見つかりません。");
    const attachments = [];
    let totalAttachmentSize = 0;
    for (const file of (body.attachments ?? []).slice(0, 4)) {
      const attachment = normalizeChatAttachment(file);
      if (!attachment) return sendError(res, 413, "添付ファイルは1件800KB以下にしてください。");
      totalAttachmentSize += attachment.dataUrl.length;
      if (totalAttachmentSize > 3_000_000) return sendError(res, 413, "添付ファイルの合計サイズが大きすぎます。");
      attachments.push({ id: id("attfile"), ...attachment });
    }
    if (!String(body.text ?? "").trim() && !attachments.length) return sendError(res, 422, "メッセージかファイルを入力してください。");
    const message = {
      id: id("msg"),
      threadId: thread.id,
      senderId: viewer.id,
      text: String(body.text ?? "").trim(),
      attachments,
      createdAt: nowIso(),
    };
    db.chatMessages.push(message);
    thread.updatedAt = nowIso();
    await saveDb(db);
    return send(res, 201, { message: publicChatMessage(db, message) });
  }

  if (pathname === "/api/chat/share-calendar" && method === "POST") {
    const body = await bodyJson(req);
    const thread = db.chatThreads.find((item) => item.id === body.threadId);
    if (!thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "チャットが見つかりません。");
    const targetIds = viewer.role === "admin" ? new Set(thread.participantIds) : new Set([viewer.id]);
    const lines = db.shifts
      .filter((shift) => !shift.deletedAt && targetIds.has(shift.userId))
      .sort((a, b) => new Date(a.startAt) - new Date(b.startAt))
      .slice(0, 8)
      .map((shift) => `${tokyoDate(new Date(shift.startAt))} ${chatUserName(db, shift.userId)} ${db.sites.find((site) => site.id === shift.siteId)?.name ?? ""}`);
    const message = {
      id: id("msg"),
      threadId: thread.id,
      senderId: viewer.id,
      text: `カレンダー共有\n${lines.join("\n") || "共有できる予定がありません。"}`,
      attachments: [],
      createdAt: nowIso(),
    };
    db.chatMessages.push(message);
    thread.updatedAt = nowIso();
    await saveDb(db);
    return send(res, 201, { message: publicChatMessage(db, message) });
  }

  if (pathname === "/api/chat/tasks" && method === "POST") {
    const body = await bodyJson(req);
    const thread = db.chatThreads.find((item) => item.id === body.threadId);
    if (!thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "チャットが見つかりません。");
    if (!thread.participantIds.includes(body.assigneeId)) return sendError(res, 422, "依頼先はチャット参加者から選択してください。");
    const task = {
      id: id("tsk"),
      threadId: thread.id,
      title: String(body.title ?? "").trim(),
      requesterId: viewer.id,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate || "",
      status: "requested",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!task.title) return sendError(res, 422, "依頼内容を入力してください。");
    db.chatTasks.unshift(task);
    db.chatMessages.push({
      id: id("msg"),
      threadId: thread.id,
      senderId: viewer.id,
      text: `タスク依頼: ${task.title}`,
      attachments: [],
      createdAt: nowIso(),
    });
    thread.updatedAt = nowIso();
    await saveDb(db);
    return send(res, 201, { task: publicChatTask(db, task) });
  }

  const chatTaskMatch = pathname.match(/^\/api\/chat\/tasks\/([^/]+)$/);
  if (chatTaskMatch && method === "PATCH") {
    const task = db.chatTasks.find((item) => item.id === chatTaskMatch[1]);
    const thread = db.chatThreads.find((item) => item.id === task?.threadId);
    if (!task || !thread || !canUseChatThread(viewer, thread)) return sendError(res, 404, "タスクが見つかりません。");
    if (viewer.role !== "admin" && viewer.id !== task.assigneeId && viewer.id !== task.requesterId) return sendError(res, 403, "このタスクは更新できません。");
    const body = await bodyJson(req);
    const allowedStatuses = new Set(["requested", "in_progress", "done"]);
    task.status = allowedStatuses.has(body.status) ? body.status : "done";
    task.updatedAt = nowIso();
    await saveDb(db);
    return send(res, 200, { task: publicChatTask(db, task) });
  }

  if (pathname === "/api/summary" && method === "GET") {
    const users = visibleUsers(db, viewer);
    const userIds = new Set(users.map((user) => user.id));
    const shifts = db.shifts.filter((shift) => !shift.deletedAt && userIds.has(shift.userId));
    const today = tokyoDate(new Date());
    return send(res, 200, {
      todayShiftCount: shifts.filter((shift) => tokyoDate(new Date(shift.startAt)) === today).length,
      pendingSiteCount: viewer.role === "admin" ? db.sites.filter((site) => site.status === "pending" && !site.deletedAt).length : 0,
      pendingHolidayCount: viewer.role === "admin" ? db.holidayRequests.filter((item) => item.status === "pending").length : db.holidayRequests.filter((item) => item.userId === viewer.id && item.status === "pending").length,
      visibleUserCount: users.length,
      recentAuditLogs: viewer.role === "admin" ? db.auditLogs.slice(0, 8) : [],
    });
  }

  if (pathname === "/api/users" && method === "GET") {
    return send(res, 200, { users: visibleUsers(db, viewer) });
  }

  if (pathname === "/api/user-permissions" && method === "GET") {
    if (viewer.role !== "admin") return sendError(res, 403, "権限設定を閲覧できるのは管理者のみです。");
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const userId = params.get("userId");
    const target = db.users.find((user) => user.id === userId && !user.deletedAt);
    if (!target) return sendError(res, 404, "ユーザーが見つかりません。");
    return send(res, 200, { userId, permissions: permissionMap(db, userId) });
  }

  if (pathname === "/api/user-permissions" && method === "PATCH") {
    if (viewer.role !== "admin") return sendError(res, 403, "権限設定を変更できるのは管理者のみです。");
    const body = await bodyJson(req);
    const target = db.users.find((user) => user.id === body.userId && !user.deletedAt);
    if (!target) return sendError(res, 404, "ユーザーが見つかりません。");
    const before = permissionMap(db, target.id);
    for (const [key, value] of Object.entries(body.permissions ?? {})) {
      setPermission(db, target.id, key, value);
    }
    const after = permissionMap(db, target.id);
    audit(db, viewer, "update_permissions", "user_permissions", target.id, before, after);
    await saveDb(db);
    return send(res, 200, { userId: target.id, permissions: after });
  }

  if (pathname === "/api/users" && method === "POST") {
    const body = await bodyJson(req);
    const newUser = {
      id: id("usr"),
      name: String(body.name ?? "").trim(),
      email: String(body.email ?? "").trim(),
      passwordHash: hashPassword(body.password || "password"),
      role: viewer.role === "admin" ? body.role || "member" : "member",
      employmentType: body.employmentType || "contractor",
      parentUserId: viewer.role === "admin" ? body.parentUserId || null : viewer.id,
      defaultUnitPrice: viewer.role === "admin" ? numberOrNull(body.defaultUnitPrice) : numberOrNull(body.parentVisibleUnitPrice),
      parentVisibleUnitPrice: numberOrNull(body.parentVisibleUnitPrice),
      hourlyRate: numberOrNull(body.hourlyRate),
      monthlySalary: numberOrNull(body.monthlySalary),
      invoiceNumber: body.invoiceNumber || "",
      iconDataUrl: normalizeIconDataUrl(body.iconDataUrl),
      isActive: true,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!newUser.name || !newUser.email) return sendError(res, 422, "氏名とメールアドレスは必須です。");
    if (db.users.some((user) => user.email === newUser.email)) return sendError(res, 409, "このメールアドレスは既に登録されています。");
    if (viewer.role !== "admin" && body.password) return sendError(res, 403, "パスワードを設定できるのは管理者のみです。");
    db.users.push(newUser);
    audit(db, viewer, "create", "users", newUser.id, null, publicUser(db, viewer, newUser));
    await saveDb(db);
    return send(res, 201, { user: publicUser(db, viewer, newUser) });
  }

  const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
  if (userMatch && method === "PATCH") {
    const target = db.users.find((user) => user.id === userMatch[1]);
    if (!canManageUser(viewer, target)) return sendError(res, 403, "このユーザーは編集できません。");
    const before = { ...target };
    const body = await bodyJson(req);
    if (body.email && body.email !== target.email) {
      const duplicate = db.users.some((user) => user.id !== target.id && user.email === body.email);
      if (duplicate) return sendError(res, 409, "このメールアドレスは既に登録されています。");
      target.email = String(body.email).trim();
    }
    target.name = body.name ?? target.name;
    target.employmentType = body.employmentType ?? target.employmentType;
    target.invoiceNumber = body.invoiceNumber ?? target.invoiceNumber;
    if (body.iconDataUrl !== undefined) target.iconDataUrl = normalizeIconDataUrl(body.iconDataUrl);
    if (viewer.role === "admin") {
      target.role = body.role ?? target.role;
      target.parentUserId = body.parentUserId === undefined ? target.parentUserId : body.parentUserId || null;
      target.defaultUnitPrice = body.defaultUnitPrice === undefined ? target.defaultUnitPrice : numberOrNull(body.defaultUnitPrice);
      target.hourlyRate = body.hourlyRate === undefined ? target.hourlyRate : numberOrNull(body.hourlyRate);
      target.monthlySalary = body.monthlySalary === undefined ? target.monthlySalary : numberOrNull(body.monthlySalary);
      if (body.password) target.passwordHash = hashPassword(String(body.password));
    }
    if (body.parentVisibleUnitPrice !== undefined) target.parentVisibleUnitPrice = numberOrNull(body.parentVisibleUnitPrice);
    target.updatedAt = nowIso();
    audit(db, viewer, "update", "users", target.id, before, { ...target });
    await saveDb(db);
    return send(res, 200, { user: publicUser(db, viewer, target) });
  }

  if (pathname === "/api/sites" && method === "GET") {
    const sites = db.sites.filter((site) => canUseSite(viewer, site));
    return send(res, 200, { sites });
  }

  if (pathname === "/api/sites" && method === "POST") {
    const body = await bodyJson(req);
    const site = {
      id: id("site"),
      name: String(body.name ?? "").trim(),
      clientCompany: body.clientCompany || "",
      address: body.address || "",
      nearestStation: body.nearestStation || "",
      projectUnitPrice: viewer.role === "admin" ? numberOrNull(body.projectUnitPrice) : null,
      memo: body.memo || "",
      status: viewer.role === "admin" ? body.status || "approved" : "pending",
      requestedBy: viewer.id,
      approvedBy: viewer.role === "admin" ? viewer.id : null,
      approvedAt: viewer.role === "admin" ? nowIso() : null,
      deletedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    if (!site.name) return sendError(res, 422, "現場名は必須です。");
    db.sites.push(site);
    audit(db, viewer, "create", "sites", site.id, null, site);
    await saveDb(db);
    return send(res, 201, { site });
  }

  const siteMatch = pathname.match(/^\/api\/sites\/([^/]+)$/);
  if (siteMatch && method === "PATCH") {
    if (viewer.role !== "admin") return sendError(res, 403, "現場を編集できるのは管理者のみです。");
    const site = db.sites.find((item) => item.id === siteMatch[1] && !item.deletedAt);
    if (!site) return sendError(res, 404, "現場が見つかりません。");
    const before = { ...site };
    const body = await bodyJson(req);
    Object.assign(site, {
      name: body.name ?? site.name,
      clientCompany: body.clientCompany ?? site.clientCompany,
      address: body.address ?? site.address,
      nearestStation: body.nearestStation ?? site.nearestStation,
      projectUnitPrice: body.projectUnitPrice === undefined ? site.projectUnitPrice : numberOrNull(body.projectUnitPrice),
      memo: body.memo ?? site.memo,
      status: body.status ?? site.status,
      approvedBy: body.status === "approved" ? viewer.id : site.approvedBy,
      approvedAt: body.status === "approved" ? nowIso() : site.approvedAt,
      updatedAt: nowIso(),
    });
    audit(db, viewer, "update", "sites", site.id, before, site);
    await saveDb(db);
    return send(res, 200, { site });
  }

  if (siteMatch && method === "DELETE") {
    if (viewer.role !== "admin") return sendError(res, 403, "現場を削除できるのは管理者のみです。");
    const site = db.sites.find((item) => item.id === siteMatch[1] && !item.deletedAt);
    if (!site) return sendError(res, 404, "現場が見つかりません。");
    const before = { ...site };
    site.deletedAt = nowIso();
    site.updatedAt = nowIso();
    audit(db, viewer, "delete", "sites", site.id, before, site);
    await saveDb(db);
    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/shifts" && method === "GET") {
    const params = new URL(req.url, `http://${req.headers.host}`).searchParams;
    const userId = params.get("userId");
    const from = params.get("from");
    const to = params.get("to");
    let shifts = db.shifts.filter((shift) => !shift.deletedAt && canManageShift(db, viewer, shift));
    if (userId) shifts = shifts.filter((shift) => shift.userId === userId);
    if (from) shifts = shifts.filter((shift) => shift.startAt >= new Date(from).toISOString());
    if (to) shifts = shifts.filter((shift) => shift.startAt <= new Date(to).toISOString());
    let changed = false;
    for (const shift of shifts) {
      changed = applyAttendanceStatus(db, shift) || changed;
    }
    if (changed) await saveDb(db);
    return send(res, 200, { shifts: shifts.map((shift) => enrichShift(db, viewer, shift)) });
  }

  if (pathname === "/api/shifts" && method === "POST") {
    const body = await bodyJson(req);
    if (!body.userId || !body.siteId || !body.startAt || !body.endAt) return sendError(res, 422, "シフト登録に必要な項目を入力してください。");
    const target = db.users.find((user) => user.id === body.userId);
    if (!canViewUser(db, viewer, target)) return sendError(res, 403, "この担当者のシフトは作成できません。");
    const site = db.sites.find((item) => item.id === body.siteId);
    if (!canUseSite(viewer, site)) return sendError(res, 403, "この現場は選択できません。");
    const shift = buildShift(body, viewer.id, null);
    const warning = isHolidayConflict(db, shift.userId, shift.startAt) ? "承認済み希望休と重なっています。" : null;
    db.shifts.push(shift);
    audit(db, viewer, "create", "shifts", shift.id, null, shift);
    await saveDb(db);
    return send(res, 201, { shift: enrichShift(db, viewer, shift), warning });
  }

  const shiftMatch = pathname.match(/^\/api\/shifts\/([^/]+)$/);
  if (shiftMatch && method === "PATCH") {
    const shift = db.shifts.find((item) => item.id === shiftMatch[1]);
    if (!canManageShift(db, viewer, shift)) return sendError(res, 403, "このシフトは編集できません。");
    const before = { ...shift };
    const body = await bodyJson(req);
    shift.userId = body.userId ?? shift.userId;
    shift.siteId = body.siteId ?? shift.siteId;
    shift.startAt = body.startAt ? new Date(body.startAt).toISOString() : shift.startAt;
    shift.endAt = body.endAt ? new Date(body.endAt).toISOString() : shift.endAt;
    shift.unitPriceOverride = body.unitPriceOverride === undefined ? shift.unitPriceOverride : numberOrNull(body.unitPriceOverride);
    if (body.status !== undefined) {
      const allowedStatuses = new Set(["scheduled", "clocked_in", "clocked_out", "late_clock_in", "late_clock_out", "cancelled"]);
      if (!allowedStatuses.has(body.status)) return sendError(res, 422, "シフトステータスが不正です。");
      shift.status = body.status;
    }
    shift.memo = body.memo ?? shift.memo;
    shift.updatedAt = nowIso();
    audit(db, viewer, "update", "shifts", shift.id, before, shift);
    await saveDb(db);
    return send(res, 200, { shift: enrichShift(db, viewer, shift), warning: isHolidayConflict(db, shift.userId, shift.startAt) ? "承認済み希望休と重なっています。" : null });
  }

  if (shiftMatch && method === "DELETE") {
    if (viewer.role !== "admin") return sendError(res, 403, "シフト削除は管理者のみです。");
    const shift = db.shifts.find((item) => item.id === shiftMatch[1] && !item.deletedAt);
    if (!shift) return sendError(res, 404, "シフトが見つかりません。");
    const before = { ...shift };
    shift.deletedAt = nowIso();
    shift.updatedAt = nowIso();
    const undoId = id("undo");
    db.undoDeletes.push({ id: undoId, shiftIds: [shift.id], expiresAt: new Date(Date.now() + undoWindowMs).toISOString(), createdBy: viewer.id });
    audit(db, viewer, "delete", "shifts", shift.id, before, shift);
    await saveDb(db);
    return send(res, 200, { ok: true, undoId, expiresAt: db.undoDeletes.at(-1).expiresAt });
  }

  if (pathname === "/api/shifts/bulk" && method === "POST") {
    if (viewer.role !== "admin") return sendError(res, 403, "一括登録は管理者のみです。");
    const body = await bodyJson(req);
    if (!body.userId || !body.siteId || !body.from || !body.to || !body.startTime || !body.endTime) return sendError(res, 422, "一括登録に必要な項目を入力してください。");
    const weekdays = new Set((body.weekdays ?? []).map(Number));
    const start = new Date(`${body.from}T00:00:00+09:00`);
    const end = new Date(`${body.to}T00:00:00+09:00`);
    const bulkOperationId = id("bulk");
    const created = [];
    for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
      const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", weekday: "short" }).format(cursor);
      const dayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekday);
      if (!weekdays.has(dayIndex)) continue;
      const date = tokyoDate(cursor);
      created.push(buildShift({
        userId: body.userId,
        siteId: body.siteId,
        startAt: `${date}T${body.startTime}:00+09:00`,
        endAt: `${date}T${body.endTime}:00+09:00`,
        memo: body.memo || "",
      }, viewer.id, bulkOperationId));
    }
    db.shifts.push(...created);
    audit(db, viewer, "bulk_create", "shifts", bulkOperationId, null, { count: created.length });
    await saveDb(db);
    return send(res, 201, { shifts: created.map((shift) => enrichShift(db, viewer, shift)), bulkOperationId });
  }

  if (pathname === "/api/shifts/bulk-delete" && method === "POST") {
    if (viewer.role !== "admin") return sendError(res, 403, "一括削除は管理者のみです。");
    const body = await bodyJson(req);
    const ids = new Set(body.shiftIds ?? []);
    const deleted = [];
    for (const shift of db.shifts) {
      if (ids.has(shift.id) && !shift.deletedAt) {
        deleted.push({ ...shift });
        shift.deletedAt = nowIso();
        shift.updatedAt = nowIso();
      }
    }
    const undoId = id("undo");
    db.undoDeletes.push({ id: undoId, shiftIds: deleted.map((shift) => shift.id), expiresAt: new Date(Date.now() + undoWindowMs).toISOString(), createdBy: viewer.id });
    audit(db, viewer, "bulk_delete", "shifts", undoId, deleted, { count: deleted.length });
    await saveDb(db);
    return send(res, 200, { ok: true, undoId, count: deleted.length, expiresAt: db.undoDeletes.at(-1).expiresAt });
  }

  if (pathname === "/api/shifts/undo-delete" && method === "POST") {
    if (viewer.role !== "admin") return sendError(res, 403, "Undo は管理者のみです。");
    const body = await bodyJson(req);
    const undo = db.undoDeletes.find((item) => item.id === body.undoId && item.createdBy === viewer.id);
    if (!undo || new Date(undo.expiresAt) < new Date()) return sendError(res, 410, "Undo の有効期限が切れています。");
    for (const shift of db.shifts) {
      if (undo.shiftIds.includes(shift.id)) {
        shift.deletedAt = null;
        shift.updatedAt = nowIso();
      }
    }
    db.undoDeletes = db.undoDeletes.filter((item) => item.id !== undo.id);
    audit(db, viewer, "undo_delete", "shifts", undo.id, null, { count: undo.shiftIds.length });
    await saveDb(db);
    return send(res, 200, { ok: true });
  }

  if (pathname === "/api/holiday-requests" && method === "GET") {
    const requests = db.holidayRequests.filter((request) => {
      const user = db.users.find((item) => item.id === request.userId);
      return viewer.role === "admin" || user?.id === viewer.id;
    }).map((request) => ({ ...request, userName: db.users.find((user) => user.id === request.userId)?.name ?? "不明" }));
    return send(res, 200, { holidayRequests: requests });
  }

  if (pathname === "/api/holiday-requests" && method === "POST") {
    const body = await bodyJson(req);
    if (!body.date) return sendError(res, 422, "希望休の日付を入力してください。");
    const request = {
      id: id("hol"),
      userId: viewer.id,
      date: body.date,
      reason: body.reason || "",
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.holidayRequests.push(request);
    audit(db, viewer, "create", "holiday_requests", request.id, null, request);
    await saveDb(db);
    return send(res, 201, { holidayRequest: request });
  }

  const holidayMatch = pathname.match(/^\/api\/holiday-requests\/([^/]+)$/);
  if (holidayMatch && method === "PATCH") {
    const request = db.holidayRequests.find((item) => item.id === holidayMatch[1]);
    if (!request) return sendError(res, 404, "希望休が見つかりません。");
    const body = await bodyJson(req);
    if (viewer.role !== "admin" && request.userId !== viewer.id) return sendError(res, 403, "この希望休は編集できません。");
    if (viewer.role !== "admin" && request.status !== "pending") return sendError(res, 403, "承認後の希望休は編集できません。");
    const before = { ...request };
    if (viewer.role === "admin" && body.status) {
      request.status = body.status;
      request.reviewedBy = viewer.id;
      request.reviewedAt = nowIso();
    } else {
      request.date = body.date ?? request.date;
      request.reason = body.reason ?? request.reason;
    }
    request.updatedAt = nowIso();
    audit(db, viewer, "update", "holiday_requests", request.id, before, request);
    await saveDb(db);
    return send(res, 200, { holidayRequest: request });
  }

  if (pathname === "/api/attendances/clock-in" && method === "POST") {
    const body = await bodyJson(req);
    const shift = db.shifts.find((item) => item.id === body.shiftId);
    if (!canManageShift(db, viewer, shift) || (viewer.role !== "admin" && shift.userId !== viewer.id)) return sendError(res, 403, "このシフトは打刻できません。");
    let attendance = db.attendances.find((item) => item.shiftId === shift.id);
    if (!attendance) {
      attendance = { id: id("att"), shiftId: shift.id, clockInAt: null, clockOutAt: null, createdAt: nowIso(), updatedAt: nowIso() };
      db.attendances.push(attendance);
    }
    attendance.clockInAt = nowIso();
    attendance.updatedAt = nowIso();
    shift.status = "clocked_in";
    shift.updatedAt = nowIso();
    audit(db, viewer, "clock_in", "attendances", attendance.id, null, attendance);
    await saveDb(db);
    return send(res, 200, { attendance, shift: enrichShift(db, viewer, shift) });
  }

  if (pathname === "/api/attendances/clock-out" && method === "POST") {
    const body = await bodyJson(req);
    const shift = db.shifts.find((item) => item.id === body.shiftId);
    if (!canManageShift(db, viewer, shift) || (viewer.role !== "admin" && shift.userId !== viewer.id)) return sendError(res, 403, "このシフトは打刻できません。");
    let attendance = db.attendances.find((item) => item.shiftId === shift.id);
    if (!attendance) {
      attendance = { id: id("att"), shiftId: shift.id, clockInAt: null, clockOutAt: null, createdAt: nowIso(), updatedAt: nowIso() };
      db.attendances.push(attendance);
    }
    attendance.clockOutAt = nowIso();
    attendance.updatedAt = nowIso();
    shift.status = "clocked_out";
    shift.updatedAt = nowIso();
    audit(db, viewer, "clock_out", "attendances", attendance.id, null, attendance);
    await saveDb(db);
    return send(res, 200, { attendance, shift: enrichShift(db, viewer, shift) });
  }

  return sendError(res, 404, "API が見つかりません。");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeIconDataUrl(value) {
  const text = String(value || "");
  if (!text) return "";
  if (text.length > 1_200_000) return "";
  if (!/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(text)) return "";
  return text;
}

function normalizeTags(value) {
  const raw = Array.isArray(value) ? value : String(value || "").split(/[,\s、#]+/);
  return [...new Set(raw.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 8))];
}

function normalizeChatAttachment(file) {
  const dataUrl = String(file?.dataUrl || "");
  if (!dataUrl || dataUrl.length > 1_200_000) return null;
  if (!/^data:[^;,]+;base64,[a-z0-9+/=]+$/i.test(dataUrl)) return null;
  return {
    name: String(file?.name ?? "file").slice(0, 80),
    type: String(file?.type ?? "application/octet-stream").slice(0, 80),
    dataUrl,
  };
}

function buildShift(body, createdBy, bulkOperationId) {
  const startAt = new Date(body.startAt).toISOString();
  const endAt = new Date(body.endAt).toISOString();
  if (new Date(endAt) <= new Date(startAt)) throw new Error("終了日時は開始日時より後にしてください。");
  return {
    id: id("shf"),
    userId: body.userId,
    siteId: body.siteId,
    startAt,
    endAt,
    unitPriceOverride: numberOrNull(body.unitPriceOverride),
    status: "scheduled",
    memo: body.memo || "",
    createdBy,
    bulkOperationId,
    deletedAt: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

async function serveStatic(req, res, pathname) {
  const safePath = normalize(pathname === "/" ? "/index.html" : pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const file = await readFile(filePath);
    res.writeHead(200, { "content-type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
    res.end(file);
  } catch {
    const index = await readFile(join(publicDir, "index.html"));
    res.writeHead(200, { "content-type": contentTypes[".html"] });
    res.end(index);
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const db = await loadDb();
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, db, url.pathname, req.method);
      return;
    }
    await serveStatic(req, res, url.pathname);
  } catch (error) {
    sendError(res, 500, error.message || "サーバーエラーが発生しました。");
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  server.listen(port, () => {
    console.log(`Staff management app running at http://localhost:${port}`);
  });
}

export {
  canViewUser,
  canManageUser,
  getVisibleUnitPriceFor,
  canManageShift,
  canUseSite,
  seedDb,
};
