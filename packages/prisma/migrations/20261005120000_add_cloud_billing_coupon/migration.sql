-- CreateEnum
CREATE TYPE "CloudBillingCouponDiscountType" AS ENUM ('PERCENT', 'AMOUNT_OFF');

-- AlterTable
ALTER TABLE "CloudSubscriptionCharge" ADD COLUMN     "couponId" TEXT,
ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CloudBillingCoupon" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "discountType" "CloudBillingCouponDiscountType" NOT NULL,
    "discountValue" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "maxRedemptions" INTEGER,
    "createdByUserId" INTEGER,

    CONSTRAINT "CloudBillingCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CloudBillingCoupon_code_key" ON "CloudBillingCoupon"("code");

-- CreateIndex
CREATE INDEX "CloudSubscriptionCharge_couponId_status_idx" ON "CloudSubscriptionCharge"("couponId", "status");

-- AddForeignKey
ALTER TABLE "CloudSubscriptionCharge" ADD CONSTRAINT "CloudSubscriptionCharge_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "CloudBillingCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
