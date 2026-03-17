const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// ─── B2 Client (S3-compatible) ──────────────────────────────────────────────
const endpoint = process.env.R2_ENDPOINT || '';
const region   = endpoint.match(/s3\.(.+?)\.backblazeb2/)?.[1] || 'us-east-005';

const b2Client = new S3Client({
  region,
  endpoint,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID     || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
  },
  forcePathStyle: true,
});

const BUCKET = process.env.R2_BUCKET_NAME;

// ─── Upload file buffer to B2 (backend receives file via multer, then sends to B2) ─
const uploadToB2 = async (fileKey, buffer, contentType) => {
  const command = new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         fileKey,
    Body:        buffer,
    ContentType: contentType,
  });
  await b2Client.send(command);
  return fileKey;
};

// ─── Generate presigned GET URL (secure download) ────────────────────────────
const getDownloadUrl = async (fileKey, expiresIn = 900) => {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key:    fileKey,
  });
  const url = await getSignedUrl(b2Client, command, { expiresIn });
  return url;
};

// ─── Delete object from B2 ──────────────────────────────────────────────────
const deleteFromR2 = async (fileKey) => {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key:    fileKey,
  });
  await b2Client.send(command);
};

// ─── Build file key for employee documents ──────────────────────────────────
const buildEmployeeDocKey = (companyId, employeeId, docTypeName, fileName) => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `companies/${companyId}/employees/${employeeId}/${docTypeName}/${Date.now()}_${safe}`;
};

// ─── Build file key for policy documents ────────────────────────────────────
const buildPolicyDocKey = (companyId, category, fileName) => {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `companies/${companyId}/policies/${category}/${Date.now()}_${safe}`;
};

module.exports = {
  b2Client,
  uploadToB2,
  getDownloadUrl,
  deleteFromR2,
  buildEmployeeDocKey,
  buildPolicyDocKey,
};
