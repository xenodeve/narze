"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GuildService = void 0;
const common_1 = require("@nestjs/common");
const supabase_js_1 = require("@supabase/supabase-js");
let GuildService = class GuildService {
    supabase;
    constructor() {
        this.supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    async getSettings(guildId) {
        const { data, error } = await this.supabase
            .from('guilds')
            .select('*')
            .eq('id', guildId)
            .single();
        if (error)
            throw error;
        return data;
    }
    async updateSettings(guildId, settings) {
        const { data, error } = await this.supabase
            .from('guilds')
            .upsert({ id: guildId, ...settings, updated_at: new Date().toISOString() })
            .select()
            .single();
        if (error)
            throw error;
        return data;
    }
    async getUserGuilds(userId) {
        const { data, error } = await this.supabase
            .from('guild_members')
            .select('guild_id, guild_role, guilds(id, name)')
            .eq('user_id', userId);
        if (error)
            throw error;
        return data ?? [];
    }
    async isMember(guildId, userId) {
        const { data } = await this.supabase
            .from('guild_members')
            .select('guild_id')
            .eq('guild_id', guildId)
            .eq('user_id', userId)
            .single();
        return !!data;
    }
};
exports.GuildService = GuildService;
exports.GuildService = GuildService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], GuildService);
//# sourceMappingURL=guild.service.js.map