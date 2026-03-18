"use client";

import React from 'react';
import { Tech } from '@/lib/tech/types';

interface TechConnectorsProps {
    techs: Tech[];
    unlockedTechIds: string[];
    scale?: number;
    offsetX?: number;
    offsetY?: number;
}

export default function TechConnectors({ 
    techs, 
    unlockedTechIds, 
    scale = 1,
    offsetX = 0,
    offsetY = 0
}: TechConnectorsProps) {
    const NODE_WIDTH = 160 * scale;
    const NODE_HEIGHT = 70 * scale; // Approximate height of the node content
    const X_GAP = 120 * scale;
    const Y_GAP = 100 * scale;

    const connections: { from: {x: number, y: number}, to: {x: number, y: number}, active: boolean, id: string }[] = [];

    techs.forEach(tech => {
        if (tech.prerequisites && tech.prerequisites.length > 0) {
            tech.prerequisites.forEach(preId => {
                const parent = techs.find(t => t.id === preId);
                if (parent) {
                    connections.push({
                        from: { 
                            x: ((parent.position?.x ?? 0) - offsetX) * X_GAP + NODE_WIDTH / 2, 
                            y: ((parent.position?.y ?? 0) - offsetY) * Y_GAP + 60 * scale // Bottom of parent node
                        },
                        to: { 
                            x: ((tech.position?.x ?? 0) - offsetX) * X_GAP + NODE_WIDTH / 2, 
                            y: ((tech.position?.y ?? 0) - offsetY) * Y_GAP // Top of child node
                        },
                        active: unlockedTechIds.includes(parent.id),
                        id: `${parent.id}-${tech.id}`
                    });
                }
            });
        }
    });

    return (
        <svg 
            className="absolute inset-0 pointer-events-none" 
            style={{ width: '100%', height: '100%', minWidth: '6000px', minHeight: '3000px' }}
        >
            <defs>
                <marker
                    id="arrowhead-active"
                    markerWidth="6"
                    markerHeight="4"
                    refX="5"
                    refY="2"
                    orient="auto"
                >
                    <polygon points="0 0, 6 2, 0 4" fill="#6366f1" />
                </marker>
                <marker
                    id="arrowhead-inactive"
                    markerWidth="6"
                    markerHeight="4"
                    refX="5"
                    refY="2"
                    orient="auto"
                >
                    <polygon points="0 0, 6 2, 0 4" fill="#1e293b" />
                </marker>
            </defs>
            
            {connections.map(conn => {
                const midY = (conn.from.y + conn.to.y) / 2;
                // Cubic bezier for a professional "flow" look
                const d = `M ${conn.from.x} ${conn.from.y} 
                           C ${conn.from.x} ${midY} 
                             ${conn.to.x} ${midY} 
                             ${conn.to.x} ${conn.to.y}`;

                return (
                    <g key={conn.id}>
                        <path
                            d={d}
                            fill="none"
                            stroke={conn.active ? '#6366f133' : '#1e293b66'}
                            strokeWidth={3 * scale}
                            className="transition-all duration-1000"
                        />
                        <path
                            d={d}
                            fill="none"
                            stroke={conn.active ? '#6366f1' : '#1e293b'}
                            strokeWidth={1.5 * scale}
                            markerEnd={conn.active ? 'url(#arrowhead-active)' : 'url(#arrowhead-inactive)'}
                            className="transition-all duration-1000"
                        />
                    </g>
                );
            })}
        </svg>
    );
}
