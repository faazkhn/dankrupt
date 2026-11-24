import { expect, test } from "vitest";
import { CandleBook } from "./candles.ts";

const M = 60_000;
const q = (time: number, mid: number) => ({ memeId: "m", time, price: mid, bid: mid, ask: mid, mid });

test("prices within a minute make one OHLC candle; fills add volume; the next minute closes it", () => {
  const book = new CandleBook();
  expect(book.price(q(10 * M + 1_000, 100))).toEqual([]);
  book.price(q(10 * M + 20_000, 104));
  book.price(q(10 * M + 40_000, 97));
  book.fill("m", 10 * M + 41_000, 25);
  book.price(q(10 * M + 59_000, 101));
  const closed = book.price(q(11 * M, 102));
  expect(closed).toEqual([{ memeId: "m", minute: 10 * M, open: 100, high: 104, low: 97, close: 101, volume: 25 }]);
  expect(book.current("m")).toMatchObject({ minute: 11 * M, open: 102, close: 102, volume: 0 });
});

test("a quiet gap still opens the new candle at the last close", () => {
  const book = new CandleBook();
  book.price(q(0, 50));
  const closed = book.price(q(5 * M, 55));
  expect(closed.map((c) => c.minute)).toEqual([0]);
  expect(book.current("m")).toMatchObject({ open: 55 });
});
