import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express'
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
  origin: [
    'https://joinsportapp.com',
    'https://www.joinsportapp.com',
    'https://focuspm.es',
    'https://www.focuspm.es',
    'http://localhost:3001', // Para desarrollo local
    'http://localhost:3000',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

   // ✅ Aumentar el límite del body para imágenes base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));
  
  // ✅ Habilitar validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  
  // ✅ CORS configurado para Vercel y desarrollo local
  app.enableCors({
    origin: [
      'http://localhost:3001',
      'https://club-management-apk.vercel.app',
      /\.vercel\.app$/,
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  
  // ✅ CRÍTICO: Escuchar en 0.0.0.0 y usar PORT de Railway
  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  
  console.log(`🚀 Application is running on port ${port}`);
}
bootstrap();