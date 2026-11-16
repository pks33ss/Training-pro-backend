-- CreateTable
CREATE TABLE "legal_config" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "razonSocial" TEXT,
    "nif" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "codigoPostal" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'España',
    "telefono" TEXT,
    "emailContacto" TEXT,
    "emailPrivacidad" TEXT,
    "emailCookies" TEXT,
    "registroMercantil" TEXT,
    "dominio" TEXT,
    "actividad" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "legal_config_pkey" PRIMARY KEY ("id")
);
