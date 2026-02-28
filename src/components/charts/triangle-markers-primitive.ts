/**
 * Custom lightweight-charts primitive that draws filled triangle markers
 * instead of the built-in arrowUp/arrowDown (which render as pentagons).
 *
 * Coordinates are computed at draw-time so the chart is guaranteed to be laid out.
 * Marker times are snapped to the nearest candle time for robust matching.
 */
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type {
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesApi,
  SeriesType,
  IChartApiBase,
} from 'lightweight-charts';

export interface TriangleMarkerData {
  time: string;
  /** >0 = up triangle, <0 = down triangle, 0 = circle */
  sentiment: number;
  color: string;
}

const MARKER_SIZE = 7; // half-width of triangle base (media pixels)
const MARKER_HEIGHT = 10; // height of triangle (media pixels)
const CIRCLE_RADIUS = 4;
const MARKER_OFFSET = 8; // distance from the price line (media pixels)

const DEBUG_DRAW = false;

class TriangleMarkersPaneRenderer implements IPrimitivePaneRenderer {
  private _data: TriangleMarkerData[];
  private _chart: IChartApiBase<Time>;
  private _series: ISeriesApi<SeriesType, Time>;
  private _priceMap: Map<string, number>;
  private _sortedTimes: string[];

  constructor(
    data: TriangleMarkerData[],
    chart: IChartApiBase<Time>,
    series: ISeriesApi<SeriesType, Time>,
    priceMap: Map<string, number>,
    sortedTimes: string[]
  ) {
    this._data = data;
    this._chart = chart;
    this._series = series;
    this._priceMap = priceMap;
    this._sortedTimes = sortedTimes;
  }

  draw(target: CanvasRenderingTarget2D): void {
    const timeScale = this._chart.timeScale();
    const series = this._series;

    target.useMediaCoordinateSpace(({ context: ctx }) => {
      if (DEBUG_DRAW) {
        // Diagnostic: red dot at top-left to verify draw() is being called
        ctx.fillStyle = 'red';
        ctx.beginPath();
        ctx.arc(30, 30, 8, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const d of this._data) {
        // Snap marker time to nearest candle time
        const snapped = this._snapTime(d.time);
        const price = this._priceMap.get(snapped);
        if (price === undefined) continue;

        const x = timeScale.timeToCoordinate(snapped as Time);
        if (x === null) continue;

        const priceY = series.priceToCoordinate(price);
        if (priceY === null) continue;

        // Offset: bullish above, bearish below, neutral above
        let y: number;
        if (d.sentiment > 0) {
          y = priceY - MARKER_OFFSET;
        } else if (d.sentiment < 0) {
          y = priceY + MARKER_OFFSET;
        } else {
          y = priceY - MARKER_OFFSET;
        }

        ctx.fillStyle = d.color;
        ctx.beginPath();

        if (d.sentiment > 0) {
          // Up triangle: ▲
          ctx.moveTo(x, y - MARKER_HEIGHT);
          ctx.lineTo(x - MARKER_SIZE, y);
          ctx.lineTo(x + MARKER_SIZE, y);
        } else if (d.sentiment < 0) {
          // Down triangle: ▼
          ctx.moveTo(x, y + MARKER_HEIGHT);
          ctx.lineTo(x - MARKER_SIZE, y);
          ctx.lineTo(x + MARKER_SIZE, y);
        } else {
          // Neutral: circle
          ctx.arc(x, y, CIRCLE_RADIUS, 0, Math.PI * 2);
        }

        ctx.closePath();
        ctx.fill();
      }
    });
  }

  /**
   * Snap a date string to the nearest candle time via binary search.
   * If the exact time exists, returns it. Otherwise returns the closest trading day.
   */
  private _snapTime(time: string): string {
    const times = this._sortedTimes;
    if (times.length === 0) return time;

    // Binary search for the closest time
    let lo = 0;
    let hi = times.length - 1;

    if (time <= times[lo]) return times[lo];
    if (time >= times[hi]) return times[hi];

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (times[mid] === time) return time;
      if (times[mid] < time) lo = mid + 1;
      else hi = mid - 1;
    }

    // lo is the first element > time, hi is the last element < time
    // Return whichever is closer
    if (lo >= times.length) return times[hi];
    if (hi < 0) return times[lo];

    const diffLo = new Date(times[lo]).getTime() - new Date(time).getTime();
    const diffHi = new Date(time).getTime() - new Date(times[hi]).getTime();
    return diffLo <= diffHi ? times[lo] : times[hi];
  }
}

class TriangleMarkersPaneView implements IPrimitivePaneView {
  private _data: TriangleMarkerData[];
  private _chart: IChartApiBase<Time>;
  private _series: ISeriesApi<SeriesType, Time>;
  private _priceMap: Map<string, number>;
  private _sortedTimes: string[];

  constructor(
    data: TriangleMarkerData[],
    chart: IChartApiBase<Time>,
    series: ISeriesApi<SeriesType, Time>,
    priceMap: Map<string, number>,
    sortedTimes: string[]
  ) {
    this._data = data;
    this._chart = chart;
    this._series = series;
    this._priceMap = priceMap;
    this._sortedTimes = sortedTimes;
  }

  zOrder(): 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer {
    return new TriangleMarkersPaneRenderer(
      this._data,
      this._chart,
      this._series,
      this._priceMap,
      this._sortedTimes
    );
  }
}

export class TriangleMarkersPrimitive implements ISeriesPrimitive<Time> {
  private _data: TriangleMarkerData[] = [];
  private _priceMap = new Map<string, number>();
  private _sortedTimes: string[] = [];
  private _chart: IChartApiBase<Time> | null = null;
  private _series: ISeriesApi<SeriesType, Time> | null = null;
  private _paneViews: TriangleMarkersPaneView[] = [];
  private _requestUpdate: (() => void) | null = null;

  /** Set the price lookup map (time → close price) for marker positioning. */
  setPriceData(prices: Array<{ time: string; close: number }>): void {
    this._priceMap.clear();
    this._sortedTimes = [];
    for (const p of prices) {
      this._priceMap.set(p.time, p.close);
      this._sortedTimes.push(p.time);
    }
    // Ensure sorted for binary search in time-snapping
    this._sortedTimes.sort();
  }

  setData(data: TriangleMarkerData[]): void {
    this._data = data;
    this._rebuildViews();
    this._requestUpdate?.();
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this._chart = param.chart;
    this._series = param.series;
    this._requestUpdate = param.requestUpdate;
    this._rebuildViews();
    this._requestUpdate();
  }

  detached(): void {
    this._chart = null;
    this._series = null;
    this._requestUpdate = null;
    this._paneViews = [];
  }

  updateAllViews(): void {
    this._rebuildViews();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this._paneViews;
  }

  /**
   * Rebuild pane views with references to chart/series.
   * Actual coordinate computation is deferred to draw() time.
   */
  private _rebuildViews(): void {
    if (!this._chart || !this._series || this._data.length === 0) {
      this._paneViews = [];
      return;
    }
    this._paneViews = [
      new TriangleMarkersPaneView(
        this._data,
        this._chart,
        this._series,
        this._priceMap,
        this._sortedTimes
      ),
    ];
  }
}
