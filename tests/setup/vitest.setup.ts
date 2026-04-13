import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { beforeEach } from 'vitest'
import { clearStorageIndexedDbForTests } from '../../src/utils/storage/idb'

beforeEach(async () => {
  await clearStorageIndexedDbForTests()
})
