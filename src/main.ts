import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as express from 'express';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // CORS (unificado: producción + desarrollo + Vercel)
  app.enableCors({
    origin: [
      'https://app.joinsportapp.com',
      'https://joinsportapp.com',
      'https://www.joinsportapp.com',
      'https://focuspm.es',
      'https://www.focuspm.es',
      'https://club-management-apk.vercel.app',
      /\.vercel\.app$/,
      'http://localhost:3001',
      'http://localhost:3000',
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Aumentar límite del body para imágenes base64
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

  // Validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');

  console.log(`🚀 Application is running on port ${port}`);
}

bootstrap();