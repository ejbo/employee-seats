-- AlterTable
ALTER TABLE "Floor" ALTER COLUMN "decor" SET DEFAULT '{"schemaVersion":2,"background":null,"elements":[]}';

-- AlterTable
ALTER TABLE "Seat" ADD COLUMN     "style" TEXT NOT NULL DEFAULT 'desk-basic';
