package si.contacts.web;

import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/** Counts failed sign-in attempts per client address in one-minute windows (SR-05). */
public class AddressLimiter {
  private final int perMinute;
  private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

  private record Window(long minute, AtomicInteger count) {}

  public AddressLimiter(int perMinute) {
    this.perMinute = perMinute;
  }

  /** Records one failed attempt; true when the address is over the limit. */
  public boolean overLimitAfterFailure(String address) {
    long minute = System.currentTimeMillis() / 60_000;
    Window w =
        windows.compute(
            address, (k, old) -> old == null || old.minute != minute ? new Window(minute, new AtomicInteger()) : old);
    if (windows.size() > 100_000) windows.entrySet().removeIf(e -> e.getValue().minute != minute);
    return w.count.incrementAndGet() > perMinute;
  }
}
