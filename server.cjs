var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_cookie_parser = __toESM(require("cookie-parser"), 1);
var import_googleapis = require("googleapis");
var import_vite = require("vite");
var import_stream = require("stream");
var import_fs = __toESM(require("fs"), 1);
var app = (0, import_express.default)();
var PORT = 3e3;
var DATA_DIR = import_path.default.join(process.cwd(), "data");
var DB_FILE = import_path.default.join(DATA_DIR, "db.json");
if (!import_fs.default.existsSync(DATA_DIR)) {
  import_fs.default.mkdirSync(DATA_DIR, { recursive: true });
}
app.use(import_express.default.json({ limit: "50mb" }));
app.use(import_express.default.urlencoded({ extended: true, limit: "50mb" }));
app.use((0, import_cookie_parser.default)());
function getOAuth2Client(req) {
  const clientId = process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "https";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const redirectUri = `${protocol}://${host}/api/auth/google/callback`;
  return new import_googleapis.google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
});
app.get("/api/auth/google/url", (req, res) => {
  try {
    const clientId = process.env.CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
    if (!clientId) {
      return res.status(400).json({
        url: null,
        error: "Las credenciales de Google Drive (CLIENT_ID) a\xFAn no han sido configuradas. Puede utilizar la Nube Integrada de 1-Clic sin credenciales."
      });
    }
    const oauth2Client = getOAuth2Client(req);
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      prompt: "select_account consent",
      scope: [
        "https://www.googleapis.com/auth/drive.file",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile"
      ]
    });
    res.json({ url: authUrl });
  } catch (err) {
    console.error("Error generating Google Auth URL:", err);
    res.status(500).json({ error: err.message || "Error al configurar la autenticaci\xF3n de Google" });
  }
});
app.get("/api/auth/google/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send("Falta c\xF3digo de autorizaci\xF3n de Google.");
  }
  try {
    const oauth2Client = getOAuth2Client(req);
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    let userEmail = "usuario@gmail.com";
    try {
      const oauth2 = import_googleapis.google.oauth2({ version: "v2", auth: oauth2Client });
      const userInfo = await oauth2.userinfo.get();
      if (userInfo.data.email) {
        userEmail = userInfo.data.email;
      }
    } catch (e) {
      console.warn("Could not fetch Google user info:", e);
    }
    res.cookie("gdrive_tokens", JSON.stringify(tokens), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1e3
      // 30 days
    });
    res.cookie("gdrive_email", userEmail, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60 * 1e3
    });
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
        <head><title>Autenticaci\xF3n Exitosa</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: white;">
          <h2>\xA1Conexi\xF3n con Google Drive Exitosa!</h2>
          <p>Cuenta: <strong>${userEmail}</strong></p>
          <p>Cerrando ventana y regresando al cat\xE1logo...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'GOOGLE_AUTH_SUCCESS',
                email: '${userEmail}'
              }, '*');
            }
            setTimeout(function() { window.close(); }, 1500);
          </script>
        </body>
      </html>
    `;
    res.send(htmlResponse);
  } catch (err) {
    console.error("Error exchanging Google auth code:", err);
    res.status(500).send(`Error en autenticaci\xF3n de Google Drive: ${err.message}`);
  }
});
app.get("/api/auth/google/status", (req, res) => {
  const tokensCookie = req.cookies.gdrive_tokens;
  const emailCookie = req.cookies.gdrive_email;
  if (tokensCookie) {
    res.json({ authenticated: true, email: emailCookie || "google-user@gmail.com" });
  } else {
    res.json({ authenticated: false });
  }
});
app.post("/api/auth/google/logout", (_req, res) => {
  res.clearCookie("gdrive_tokens");
  res.clearCookie("gdrive_email");
  res.json({ success: true });
});
app.post("/api/drive/upload-catalog", async (req, res) => {
  const tokensCookie = req.cookies.gdrive_tokens;
  if (!tokensCookie) {
    return res.status(401).json({
      error: 'No se ha iniciado sesi\xF3n con Google Drive. Por favor presione "Iniciar Sesi\xF3n con Google Drive".'
    });
  }
  try {
    const tokens = JSON.parse(tokensCookie);
    const oauth2Client = getOAuth2Client(req);
    oauth2Client.setCredentials(tokens);
    const drive = import_googleapis.google.drive({ version: "v3", auth: oauth2Client });
    const { pdfBase64, filename = "Catalogo_Oficial_TAZZ.pdf" } = req.body;
    if (!pdfBase64) {
      return res.status(400).json({ error: "Falta el contenido PDF en formato base64." });
    }
    const cleanBase64 = pdfBase64.replace(/^data:application\/pdf;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const stream = import_stream.Readable.from(buffer);
    const existingSearch = await drive.files.list({
      q: `name = '${filename}' and trashed = false`,
      fields: "files(id, name, webViewLink, webContentLink)"
    });
    let fileId = "";
    let webViewLink = "";
    if (existingSearch.data.files && existingSearch.data.files.length > 0) {
      fileId = existingSearch.data.files[0].id;
      console.log(`Actualizando archivo existente en Google Drive. ID: ${fileId}`);
      const updateRes = await drive.files.update({
        fileId,
        media: {
          mimeType: "application/pdf",
          body: stream
        },
        fields: "id, name, webViewLink, webContentLink"
      });
      fileId = updateRes.data.id;
      webViewLink = updateRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    } else {
      console.log("Creando nuevo archivo de cat\xE1logo en Google Drive...");
      const createRes = await drive.files.create({
        requestBody: {
          name: filename,
          mimeType: "application/pdf",
          description: "Cat\xE1logo Oficial de Productos - TAZZ SHOPPER PRO"
        },
        media: {
          mimeType: "application/pdf",
          body: stream
        },
        fields: "id, name, webViewLink, webContentLink"
      });
      fileId = createRes.data.id;
      webViewLink = createRes.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
      await drive.permissions.create({
        fileId,
        requestBody: {
          role: "reader",
          type: "anyone"
        }
      });
    }
    const viewUrl = webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
    res.json({
      success: true,
      fileId,
      url: viewUrl,
      updatedAt: (/* @__PURE__ */ new Date()).toLocaleString("es-PE"),
      message: "\xA1Cat\xE1logo sincronizado exitosamente en Google Drive! El enlace se mantiene constante para todos sus clientes."
    });
  } catch (err) {
    console.error("Error uploading to Google Drive:", err);
    res.status(500).json({
      error: `Error al subir PDF a Google Drive: ${err.message || err}`
    });
  }
});
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const possibleDistPaths = [
      import_path.default.join(__dirname, "dist"),
      import_path.default.join(__dirname, "..", "dist"),
      import_path.default.join(process.cwd(), "dist")
    ];
    if (process.resourcesPath) {
      possibleDistPaths.unshift(import_path.default.join(process.resourcesPath, "app.asar", "dist"));
      possibleDistPaths.unshift(import_path.default.join(process.resourcesPath, "app", "dist"));
    }
    const fs2 = await import("fs");
    const distPath = possibleDistPaths.find((p) => fs2.existsSync(p)) || possibleDistPaths[0];
    console.log(`[Express] Serviendo interfaz desde: ${distPath}`);
    app.use(import_express.default.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor iniciado en http://0.0.0.0:${PORT}`);
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
