-- CreateEnum
CREATE TYPE "CloudSubscriptionChargeStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED');

-- CreateTable
CREATE TABLE "CloudSubscription" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "CloudSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudSubscriptionCharge" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" "CloudSubscriptionChargeStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "provider" TEXT NOT NULL,
    "providerChargeId" TEXT,
    "paymentUrl" TEXT,
    "pixCopyPaste" TEXT,
    "expiresAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "createdByUserId" INTEGER,
    "organisationId" TEXT NOT NULL,

    CONSTRAINT "CloudSubscriptionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CloudBillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "chargeId" TEXT,

    CONSTRAINT "CloudBillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloudSubscription_organisationId_key" ON "CloudSubscription"("organisationId");

-- CreateIndex
CREATE INDEX "CloudSubscriptionCharge_organisationId_status_idx" ON "CloudSubscriptionCharge"("organisationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CloudSubscriptionCharge_provider_providerChargeId_key" ON "CloudSubscriptionCharge"("provider", "providerChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "CloudBillingWebhookEvent_provider_eventId_key" ON "CloudBillingWebhookEvent"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "CloudSubscription" ADD CONSTRAINT "CloudSubscription_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CloudSubscriptionCharge" ADD CONSTRAINT "CloudSubscriptionCharge_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

