/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolRequestSchema, ListResourcesRequestSchema, ListToolsRequestSchema, ReadResourceRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { Context } from './context';

import type { ContextOptions } from './context';
import type { Resource } from './resources/resource';
import type { Tool } from './tools/tool';

type Options = ContextOptions & {
  name: string;
  version: string;
  tools: Tool[];
  resources: Resource[],
};

export function createServerWithTools(options: Options): McpServer {
  const { name, version, tools, resources } = options;
  const context = new Context(options);
  const mcpServer = new McpServer({ name, version }, {
    capabilities: {
      tools: {},
      resources: {},
    },
  });

  mcpServer.server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: tools.map(tool => tool.schema) };
  });

  mcpServer.server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { resources: resources.map(resource => resource.schema) };
  });

  mcpServer.server.setRequestHandler(CallToolRequestSchema, async request => {
    const tool = tools.find(tool => tool.schema.name === request.params.name);
    if (!tool) {
      return {
        content: [{ type: 'text', text: `Tool "${request.params.name}" not found` }],
        isError: true,
      };
    }

    try {
      const result = await tool.handle(context, request.params.arguments);
      return result;
    } catch (error) {
      return {
        content: [{ type: 'text', text: String(error) }],
        isError: true,
      };
    }
  });

  mcpServer.server.setRequestHandler(ReadResourceRequestSchema, async request => {
    const resource = resources.find(resource => resource.schema.uri === request.params.uri);
    if (!resource)
      return { contents: [] };

    const contents = await resource.read(context, request.params.uri);
    return { contents };
  });

  const oldClose = mcpServer.server.close.bind(mcpServer.server);

  mcpServer.server.close = async () => {
    await oldClose();
    await context.close();
  };

  return mcpServer;
}

export class ServerList {
  private _servers: McpServer[] = [];
  private _serverFactory: () => McpServer;

  constructor(serverFactory: () => McpServer) {
    this._serverFactory = serverFactory;
  }

  async create() {
    const server = this._serverFactory();
    this._servers.push(server);
    return server;
  }

  async close(server: McpServer) {
    const index = this._servers.indexOf(server);
    if (index !== -1)
      this._servers.splice(index, 1);
    await server.close();
  }

  async closeAll() {
    await Promise.all(this._servers.map(server => server.close()));
  }
}
