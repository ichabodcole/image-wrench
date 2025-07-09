import { beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { vi } from 'vitest';

vi.mock('~/services/logger', () => ({
  Logger: {
    getLogger: () => ({
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    }),
  },
}));

beforeAll(() => {
  // Add your global beforeAll logics
});

beforeEach(() => {
  // Add your globalbeforeEach logics
});

afterAll(() => {
  // Add your global afterAll logics
});

afterEach(() => {
  // Add your global afterEach logics
});
