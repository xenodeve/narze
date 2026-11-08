import { ChartRegionSchema } from "@narze/shared";
import { Controller, Get, Inject, NotFoundException, Param, ServiceUnavailableException } from "@nestjs/common";
import { ChartService, ChartUnavailable } from "./chart-service";

/** Charts (#109, spec #53): public data, served from the Backend's cache. */
@Controller("api/charts")
export class ChartsController {
  constructor(@Inject(ChartService) private readonly charts: ChartService) {}

  @Get(":region")
  async chart(@Param("region") region: string) {
    const parsed = ChartRegionSchema.safeParse(region);
    if (!parsed.success) throw new NotFoundException("no such chart");
    try {
      return await this.charts.get(parsed.data);
    } catch (error) {
      // Spec #109 AC3: say the chart is unavailable instead of showing made-up data.
      if (error instanceof ChartUnavailable) throw new ServiceUnavailableException("chart unavailable");
      throw error;
    }
  }
}
