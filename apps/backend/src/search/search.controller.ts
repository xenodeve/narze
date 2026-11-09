import { type SearchResponse, SearchSourceSchema, type Sources } from "@narze/shared";
import { BadRequestException, Controller, Get, Headers, Inject, NotFoundException, Param, Query } from "@nestjs/common";
import { Authenticator } from "../auth/authenticator";
import { SOURCES } from "../tokens";
import { type AlbumPage, type ArtistPage, type ChannelPage, SearchService } from "./search-service";

/** The Catalog over REST (#105): search and the artist, album and channel pages, signed-in only. */
@Controller("api")
export class SearchController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(SearchService) private readonly catalog: SearchService,
    @Inject(SOURCES) private readonly ready: Sources,
  ) {}

  /** #157: which sources can play, so the Dashboard shows the others as coming soon. Not secret: public. */
  @Get("sources")
  sources(): Sources {
    return this.ready;
  }

  @Get("search")
  async search(
    @Headers("authorization") authorization: string | undefined,
    @Query("q") q: string | undefined,
    @Query("source") source: string | undefined,
  ): Promise<SearchResponse> {
    await this.auth.require(authorization);
    if (!q?.trim()) throw new BadRequestException('Query parameter "q" is required');
    // The Dashboard's default is the Spotify Web API (spec #57).
    const mode = SearchSourceSchema.safeParse(source ?? "spotify-api");
    if (!mode.success) throw new BadRequestException("Unknown search source");
    return this.catalog.search(q.slice(0, 200), mode.data);
  }

  @Get("catalog/artist/:id")
  async artist(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
  ): Promise<ArtistPage> {
    await this.auth.require(authorization);
    return found(await this.catalog.artist(id));
  }

  @Get("catalog/album/:id")
  async album(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
  ): Promise<AlbumPage> {
    await this.auth.require(authorization);
    return found(await this.catalog.album(id));
  }

  @Get("catalog/channel/:id")
  async channel(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
  ): Promise<ChannelPage> {
    await this.auth.require(authorization);
    return found(await this.catalog.channel(id));
  }
}

function found<T>(page: T | null): T {
  if (!page) throw new NotFoundException();
  return page;
}
