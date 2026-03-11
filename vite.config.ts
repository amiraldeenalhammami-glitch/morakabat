import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import express from 'express';
import fs from 'fs';
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(), 
      tailwindcss(),
      {
        name: 'api-server',
        configureServer(server) {
          server.middlewares.use(express.json());

          let db: any = null;
          const getDb = async () => {
            if (db) return db;
            let config: any = {};
            if (fs.existsSync('./firebase-applet-config.json')) {
              config = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
            }
            if (!admin.apps.length) {
              admin.initializeApp({ projectId: config.projectId });
            }
            db = admin.firestore(config.firestoreDatabaseId || undefined);
            return db;
          };

          server.middlewares.use(async (req, res, next) => {
            if (req.url === '/api/health') {
              res.end(JSON.stringify({ status: 'ok' }));
              return;
            }

            if (req.url === '/api/send-otp' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => body += chunk);
              req.on('end', async () => {
                try {
                  const { email } = JSON.parse(body);
                  const currentDb = await getDb();
                  const otp = Math.floor(100000 + Math.random() * 900000).toString();
                  await currentDb.collection("otps").doc(email).set({ otp, expiresAt: Date.now() + 600000 });
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
                  res.end(JSON.stringify({ success: true }));
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
              return;
            }

            if (req.url === '/api/verify-otp' && req.method === 'POST') {
              let body = '';
              req.on('data', chunk => body += chunk);
              req.on('end', async () => {
                try {
                  const { email, otp } = JSON.parse(body);
                  const currentDb = await getDb();
                  const doc = await currentDb.collection("otps").doc(email).get();
                  if (doc.exists && doc.data().otp === otp) {
                    await currentDb.collection("otps").doc(email).delete();
                    res.end(JSON.stringify({ success: true }));
                  } else {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: "Invalid OTP" }));
                  }
                } catch (err: any) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
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
