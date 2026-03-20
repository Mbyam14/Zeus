import api from './api';

type EventProperties = Record<string, string | number | boolean | null>;

class AnalyticsService {
  private queue: Array<{ event_name: string; properties?: EventProperties }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Track an event. Events are batched and sent every 5 seconds.
   */
  track(eventName: string, properties?: EventProperties) {
    this.queue.push({ event_name: eventName, properties });

    // Debounce flush
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), 5000);
    }
  }

  /**
   * Flush queued events to the backend.
   */
  private async flush() {
    this.flushTimer = null;
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    // Fire-and-forget — don't block the UI on analytics
    for (const event of events) {
      try {
        await api.post('/api/analytics/track', event);
      } catch {
        // Analytics failures are silent
      }
    }
  }

  /**
   * Immediately flush (e.g., on app background).
   */
  async flushNow() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }
}

export const analyticsService = new AnalyticsService();

// Convenience tracking functions
export const trackEvent = (name: string, props?: EventProperties) =>
  analyticsService.track(name, props);
