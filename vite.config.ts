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
          server.middlewares.use(express.json());

          // Initialize local SQLite database for OTPs
          const db = new Database('otps.db');
          db.exec(`
            CREATE TABLE IF NOT EXISTS otps (
              email TEXT PRIMARY KEY,
              otp TEXT,
              expiresAt INTEGER
            )
          `);

          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/health') {
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ status: 'ok' }));
              return;
            }

            if (req.url === '/api/send-otp' && req.method === 'POST') {
              try {
                const { email } = (req as any).body;
                if (!email) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Email is required" }));
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
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                console.error('Error in /api/send-otp:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            }

            if (req.url === '/api/verify-otp' && req.method === 'POST') {
              try {
                const { email, otp } = (req as any).body;
                if (!email || !otp) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Email and OTP are required" }));
                  return;
                }
                
                const row = db.prepare('SELECT otp, expiresAt FROM otps WHERE email = ?').get(email) as any;
                
                let isValid = false;
                if (row && row.otp === otp && row.expiresAt > Date.now()) {
                  isValid = true;
                }

                if (isValid) {
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true }));
                } else {
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "رمز التحقق غير صحيح أو انتهت صلاحيته" }));
                }
              } catch (err: any) {
                console.error('Error in /api/verify-otp:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
              }
              return;
            }

            if (req.url === '/api/reset-password' && req.method === 'POST') {
              try {
                const { email, otp, newPassword } = (req as any).body;
                if (!email || !otp || !newPassword) {
                  res.statusCode = 400;
                  res.end(JSON.stringify({ error: "Email, OTP, and new password are required" }));
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
                  res.statusCode = 400;
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ error: "رمز التحقق غير صحيح أو انتهت صلاحيته" }));
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
                    res.statusCode = 404;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ error: "البريد الإلكتروني غير مسجل في النظام" }));
                    return;
                  }
                  
                  // Check for disabled Identity Toolkit API
                  const isApiDisabled = authErr.message && (
                    authErr.message.includes('identitytoolkit.googleapis.com') ||
                    authErr.message.includes('SERVICE_DISABLED') ||
                    authErr.message.includes('accessNotConfigured')
                  );

                  if (isApiDisabled) {
                    res.statusCode = 403;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify({ 
                      error: "خدمة Identity Toolkit API غير مفعلة في مشروعك. يرجى تفعيلها من لوحة تحكم Google Cloud (الرابط موجود في سجلات الخادم) ثم المحاولة بعد 5 دقائق." 
                    }));
                    return;
                  }
                  
                  throw authErr;
                }

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ success: true }));
              } catch (err: any) {
                console.error('Error in /api/reset-password:', err);
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err.message }));
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
