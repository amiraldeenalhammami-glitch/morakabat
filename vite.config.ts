import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import express from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import Database from 'better-sqlite3';
import admin from 'firebase-admin';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');

  // Initialize Firebase Admin
  if (!admin.apps.length) {
    const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf-8'));
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
  }

  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-server',
        configureServer(server) {
          // Initialize local SQLite database for OTPs
          const db = new Database('otps.db');
          db.exec(`
            CREATE TABLE IF NOT EXISTS otps (
              email TEXT PRIMARY KEY,
              otp TEXT,
              expiresAt INTEGER
            )
          `);

          const sendJSON = (res: any, data: any, status = 200) => {
            res.statusCode = status;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
          };

          const getBody = async (req: any) => {
            if (req.body) return req.body;
            return new Promise((resolve) => {
              let body = '';
              req.on('data', (chunk) => body += chunk);
              req.on('end', () => {
                try {
                  resolve(body ? JSON.parse(body) : {});
                } catch (e) {
                  resolve({});
                }
              });
            });
          };

          server.middlewares.use(async (req, res, next) => {
            const url = req.url?.split('?')[0];

            if (url === '/api/health') {
              sendJSON(res, { status: 'ok' });
              return;
            }

            if (url === '/api/send-otp' && req.method === 'POST') {
              try {
                const body = await getBody(req);
                const { email } = body;
                if (!email) {
                  sendJSON(res, { error: "البريد الإلكتروني مطلوب" }, 400);
                  return;
                }
                
                const otp = Math.floor(100000 + Math.random() * 900000).toString();
                const expiresAt = Date.now() + 600000; // 10 minutes

                // Store in SQLite
                const upsert = db.prepare('INSERT OR REPLACE INTO otps (email, otp, expiresAt) VALUES (?, ?, ?)');
                upsert.run(email, otp, expiresAt);

                console.log(`OTP for ${email}: ${otp}`);
                
                if (env.SMTP_USER && env.SMTP_PASS) {
                  const transporter = nodemailer.createTransport({
                    host: env.SMTP_HOST || "smtp.gmail.com",
                    port: parseInt(env.SMTP_PORT || "587"),
                    secure: env.SMTP_SECURE === "true",
                    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }
                  });
                  await transporter.sendMail({
                    from: `"نظام مراقبة الامتحانات" <${env.SMTP_USER}>`,
                    to: email,
                    subject: "رمز التحقق",
                    text: `رمزك هو: ${otp}`
                  });
                }
                sendJSON(res, { success: true });
              } catch (err: any) {
                console.error('Error in /api/send-otp:', err);
                sendJSON(res, { error: err.message }, 500);
              }
              return;
            }

            if (url === '/api/verify-otp' && req.method === 'POST') {
              try {
                const body = await getBody(req);
                const { email, otp } = body;
                if (!email || !otp) {
                  sendJSON(res, { error: "البريد الإلكتروني والرمز مطلوبان" }, 400);
                  return;
                }
                
                const row = db.prepare('SELECT otp, expiresAt FROM otps WHERE email = ?').get(email) as any;
                
                let isValid = false;
                if (row && row.otp === otp && row.expiresAt > Date.now()) {
                  isValid = true;
                }

                if (isValid) {
                  sendJSON(res, { success: true });
                } else {
                  sendJSON(res, { error: "رمز التحقق غير صحيح أو انتهت صلاحيته" }, 400);
                }
              } catch (err: any) {
                console.error('Error in /api/verify-otp:', err);
                sendJSON(res, { error: err.message }, 500);
              }
              return;
            }

            if (url === '/api/reset-password' && req.method === 'POST') {
              try {
                const body = await getBody(req);
                const { email, otp, newPassword } = body;
                if (!email || !otp || !newPassword) {
                  sendJSON(res, { error: "جميع الحقول مطلوبة" }, 400);
                  return;
                }

                // Verify OTP
                const row = db.prepare('SELECT otp, expiresAt FROM otps WHERE email = ?').get(email) as any;
                
                let isValid = false;
                if (row && row.otp === otp && row.expiresAt > Date.now()) {
                  isValid = true;
                  db.prepare('DELETE FROM otps WHERE email = ?').run(email);
                }

                if (!isValid) {
                  sendJSON(res, { error: "رمز التحقق غير صحيح أو انتهت صلاحيته" }, 400);
                  return;
                }

                // Update password in Firebase Auth
                try {
                  const user = await admin.auth().getUserByEmail(email);
                  await admin.auth().updateUser(user.uid, {
                    password: newPassword
                  });
                } catch (authErr: any) {
                  console.error('Auth Error in reset-password:', authErr);
                  if (authErr.code === 'auth/user-not-found') {
                    sendJSON(res, { error: "البريد الإلكتروني غير مسجل في النظام" }, 404);
                    return;
                  }
                  
                  const isApiDisabled = authErr.message && (
                    authErr.message.includes('identitytoolkit.googleapis.com') ||
                    authErr.message.includes('SERVICE_DISABLED') ||
                    authErr.message.includes('accessNotConfigured')
                  );

                  if (isApiDisabled) {
                    sendJSON(res, { 
                      error: "خدمة Identity Toolkit API غير مفعلة في مشروعك. يرجى تفعيلها من لوحة تحكم Google Cloud ثم المحاولة بعد 5 دقائق." 
                    }, 403);
                    return;
                  }
                  
                  throw authErr;
                }

                sendJSON(res, { success: true });
              } catch (err: any) {
                console.error('Error in /api/reset-password:', err);
                sendJSON(res, { error: err.message }, 500);
              }
              return;
            }

            next();
          });
        }
      }
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
