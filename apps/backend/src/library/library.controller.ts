import { LIKED_PLAYLIST, NewPlaylistSchema, PlaylistChangeSchema, PlaylistTrackSchema } from "@narze/shared";
import {
  BadGatewayException,
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import { z } from "zod";
import { Authenticator } from "../auth/authenticator";
import { RateLimiter, type RateLimits } from "../rate-limit";
import { UserGateway } from "../realtime/user.gateway";
import { RATE_LIMITS } from "../tokens";
import { type Importer, ImportRefused } from "./library-importer";
import { LibraryStore } from "./library-store";

export const IMPORTER = Symbol("IMPORTER");

const parse = <T>(schema: z.ZodType<T>, body: unknown): T => {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new BadRequestException("invalid request");
  return parsed.data;
};

/** The Library over REST (#107): only ever the signed-in user's own playlists and likes. */
@Controller("api/library")
export class LibraryController {
  constructor(
    @Inject(Authenticator) private readonly auth: Authenticator,
    @Inject(LibraryStore) private readonly library: LibraryStore,
    @Inject(IMPORTER) private readonly importer: Importer,
    @Inject(UserGateway) private readonly gateway: UserGateway,
    @Inject(RATE_LIMITS) limits: RateLimits,
  ) {
    this.imports = new RateLimiter(limits.import);
  }

  /** One preview can read up to 50 Spotify pages: limited per user, wherever they call from (#142). */
  private readonly imports: RateLimiter;

  @Get("playlists")
  async list(@Headers("authorization") authorization: string | undefined) {
    const { discordId } = await this.auth.require(authorization);
    return this.library.list(discordId);
  }

  @Post("playlists")
  @HttpCode(201)
  async create(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const { discordId } = await this.auth.require(authorization);
    const playlist = await this.library.create(discordId, parse(NewPlaylistSchema, body));
    this.gateway.pushLibrary(discordId, playlist.id);
    return playlist;
  }

  @Get("playlists/:id")
  async read(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const { discordId } = await this.auth.require(authorization);
    const playlist = await this.library.get(discordId, id);
    if (!playlist) throw new NotFoundException();
    return playlist;
  }

  @Put("playlists/:id")
  async change(
    @Headers("authorization") authorization: string | undefined,
    @Param("id") id: string,
    @Body() body: unknown,
  ) {
    const { discordId } = await this.auth.require(authorization);
    const playlist = await this.library.change(discordId, id, parse(PlaylistChangeSchema, body));
    if (!playlist) throw new NotFoundException();
    this.gateway.pushLibrary(discordId, id);
    return playlist;
  }

  @Delete("playlists/:id")
  @HttpCode(204)
  async remove(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) {
    const { discordId } = await this.auth.require(authorization);
    if (!(await this.library.remove(discordId, id))) throw new NotFoundException();
    this.gateway.pushLibrary(discordId, id);
  }

  /** Spec #50, #71: the preview of a Spotify or YouTube playlist before it is saved. */
  @Post("import")
  @HttpCode(200)
  async preview(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) res: { setHeader(name: string, value: string): void },
  ) {
    const { discordId } = await this.auth.require(authorization);
    // A malformed body costs nothing downstream, so only a well-formed one is counted.
    const { url } = parse(z.object({ url: z.string().max(500) }), body);
    const { ok, retryAfterMs } = this.imports.hit(discordId);
    if (!ok) {
      res.setHeader("retry-after", String(Math.ceil(retryAfterMs / 1000)));
      throw new HttpException("Too Many Requests", HttpStatus.TOO_MANY_REQUESTS);
    }
    try {
      return await this.importer(url);
    } catch (error) {
      if (error instanceof ImportRefused) throw new BadRequestException(error.message);
      // Our side failed (Lavalink, Spotify): not the user's link.
      throw new BadGatewayException("could not load that playlist");
    }
  }

  @Get("likes")
  async likes(@Headers("authorization") authorization: string | undefined) {
    const { discordId } = await this.auth.require(authorization);
    return this.library.likes(discordId);
  }

  @Put("likes")
  @HttpCode(204)
  async like(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    const { discordId } = await this.auth.require(authorization);
    await this.library.like(discordId, parse(PlaylistTrackSchema, body));
    this.gateway.pushLibrary(discordId, LIKED_PLAYLIST);
  }

  @Delete("likes")
  @HttpCode(204)
  async unlike(@Headers("authorization") authorization: string | undefined, @Query("uri") uri: string | undefined) {
    const { discordId } = await this.auth.require(authorization);
    if (!uri) throw new BadRequestException("uri is required");
    await this.library.unlike(discordId, uri);
    this.gateway.pushLibrary(discordId, LIKED_PLAYLIST);
  }
}
