'use client';

import { memo } from 'react';
import { BotStatus } from '@/types/bot';
import { Badge } from '@/components/ui/badge';
import {
    Circle,
    CircleOff,
    Loader2,
    Music,
    Pause,
    Radio
} from 'lucide-react';

interface BotStatusBadgeProps {
    status: BotStatus['state'];
    className?: string;
}

export const BotStatusBadge = memo(function BotStatusBadge({ status, className }: BotStatusBadgeProps) {
    const statusConfig = {
        online: {
            label: 'Online',
            icon: Circle,
            className: 'bg-green-500/10 text-green-500 border-green-500/20',
        },
        offline: {
            label: 'Offline',
            icon: CircleOff,
            className: 'bg-red-500/10 text-red-500 border-red-500/20',
        },
        starting: {
            label: 'Starting',
            icon: Loader2,
            className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
        },
        playing: {
            label: 'Playing',
            icon: Music,
            className: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
        },
        paused: {
            label: 'Paused',
            icon: Pause,
            className: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
        },
        idle: {
            label: 'Idle',
            icon: Radio,
            className: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
        },
    };

    const config = statusConfig[status] || statusConfig.offline;
    const Icon = config.icon;

    return (
        <Badge variant="outline" className={`${config.className} ${className}`}>
            <Icon className={`mr-1 h-3 w-3 ${status === 'starting' ? 'animate-spin' : ''}`} />
            {config.label}
        </Badge>
    );
});
