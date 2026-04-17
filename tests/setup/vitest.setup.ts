import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { clearBenchmarkReportsForTests } from '../../src/utils/storage/benchmarkReports'
import { clearBodyProgressSnapshotsForTests } from '../../src/utils/storage/bodyProgress'
import { clearEncryptedSyncStateForTests } from '../../src/utils/storage/encryptedSync'
import { clearFoodReviewQueueForTests } from '../../src/utils/storage/foodReviewQueue'
import { clearGarminImportStoresForTests } from '../../src/utils/storage/garminImports'
import { clearStorageIndexedDbForTests } from '../../src/utils/storage/idb'
import { clearWorkoutStorageForTests } from '../../src/utils/storage/workouts'

(globalThis as { __APP_BUILD_ID__?: string }).__APP_BUILD_ID__ = 'test-build'

beforeEach(async () => {
  await clearStorageIndexedDbForTests()
  await clearBodyProgressSnapshotsForTests()
  clearFoodReviewQueueForTests()
  clearGarminImportStoresForTests()
  clearEncryptedSyncStateForTests()
  clearBenchmarkReportsForTests()
  clearWorkoutStorageForTests()
})
