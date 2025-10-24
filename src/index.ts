import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

declare module "@modelcontextprotocol/sdk/server/mcp.js" {
  interface RequestHandlerExtra<S, N> {
    config: z.infer<typeof configSchema>;
  }
}

type ToolExtra = {
  ai_description: string;
  config: z.infer<typeof configSchema>;
};

export const configSchema = z.object({
  debug: z.boolean().default(false).describe("Enable debug logging"),
  hapAppkey: z.string().describe("HAP-Appkey for external API authentication"),
  hapSign: z.string().describe("HAP-Sign for external API authentication"),
  apiBaseUrl: z.string().describe("apiBaseUrl"),
});

export default function createServer({ config }: { config: z.infer<typeof configSchema> }) {
  const server = new McpServer({
    name: "HAP-MCP",
    version: "1.0.0",
  });

  server.registerTool(
    "postCreateOptionset",
    {
      title: "创建选项集",
      description: "创建选项集信息（名称、选项值/排序/颜色/分值）",
      inputSchema: {
        name: z.string(),
        options: z.array(
          z.object({
            value: z.string(),
            index: z.number(),
            color: z.string(),
            score: z.number(),
          })
        ),
        enableColor: z.boolean(),
        enableScore: z.boolean(),
        ai_description: z.string().describe("创建选项集"),
      },
    },
    async (args, extra) => { // Removed config from destructuring, will access config from createServer scope
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = "/v3/app/optionsets";
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const { name, options, enableColor, enableScore } = args;

      // HAP-Appkey and HAP-Sign are required.
      // Accessing config from createServer scope
      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({
            name,
            options,
            enableColor,
            enableScore,
          }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "createRecord",
    {
      title: "新建行记录",
      description: "新建行记录",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        fields: z.array(
          z.object({
            id: z.string().describe("字段 ID/别名"),
            value: z.any().describe("字段值"),
            type: z.string().optional().describe("SingleSelect/MultipleSelect:1=不增量选项，2=允许增加选项，默认为1; Attachment:0=覆盖，1=新增，默认为 0.")
          })
        ).describe("控件数据"),
        triggerWorkflow: z.boolean().default(true).describe("是否触发工作流").optional(),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, fields, triggerWorkflow, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ fields, triggerWorkflow }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "createRole",
    {
      title: "创建角色",
      description: "创建角色 信息包含：角色名称、描述、权限信息",
      inputSchema: {
        name: z.string().describe("角色名称"),
        description: z.string().describe("角色描述"),
        hideAppForMembers: z.string().describe("是否对成员隐藏应用,true：隐藏，false：不隐藏"), // OpenAPI spec says string, but description implies boolean
        type: z.string().describe("角色类型 0：自定义角色"), // OpenAPI spec says string, but description implies number
        permissionScope: z.string().describe("分发所有应用项, 80：可查看、编辑、删除所有记录; 60：可查看所有记录，但只能编辑、删除自己拥有的记录; 30：可查看加入的，只能编辑、删除自己拥有的记录; 20：对所有记录只有查看权限; 0：分发有权限应用项"), // OpenAPI spec says string, but description implies number
        globalPermissions: z.object({
          addRecord: z.boolean().describe("添加记录权限，true 有权限，false 无权限"),
          share: z.boolean().describe("视图和记录的公开分享权限，true 有权限，false 无权限"),
          import: z.boolean().describe("导入权限，true 有权限，false 无权限"),
          export: z.boolean().describe("导出权限，true 有权限，false 无权限"),
          log: z.boolean().describe("日志，true 有权限，false 无权限"),
          attachmentDownload: z.boolean().describe("附件下载，true 有权限，false 无权限"),
          systemPrint: z.boolean().describe("系统打印，true 有权限，false 无权限"),
          discuss: z.boolean().describe("讨论权限，true 有权限，false 无权限"),
        }).partial().optional().describe("应用全局权限，仅在permissionScope大于0时生效"),
        worksheetPermissions: z.array(z.object({
          id: z.string().describe("工作表Id"),
          recordDataScope: z.object({
            read: z.number().describe("查看权限范围 0：未授权 20：仅我拥有的 30：我的及下属的 100：全部的"),
            edit: z.number().describe("编辑权限范围 0：未授权 20：仅我拥有的 30：我的及下属的 100：全部的"),
            delete: z.number().describe("删除权限范围 0：未授权 20：仅我拥有的 30：我的及下属的 100：全部的"),
          }),
          worksheetActions: z.object({
            shareView: z.boolean().describe("公开分享视图权限"),
            import: z.boolean().describe("工作表导入权限"),
            export: z.boolean().describe("工作表导出权限"),
            discuss: z.boolean().describe("工作表讨论权限"),
            batchOperation: z.boolean().describe("工作表批量操作权限"),
          }),
          recordActions: z.object({
            attachmentDownload: z.boolean().describe("记录附件下载权限"),
            discuss: z.boolean().describe("记录讨论权限"),
            systemPrint: z.boolean().describe("记录系统打印权限"),
            log: z.boolean().describe("记录日志权限"),
            add: z.boolean().describe("添加记录权限"),
            share: z.boolean().describe("公开分享记录权限"),
          }),
          recordPermissionInViews: z.array(z.object({
            read: z.boolean().describe("查看行记录权限"),
            edit: z.boolean().describe("编辑行记录权限"),
            delete: z.boolean().describe("删除行记录权限"),
            viewId: z.string().describe("视图ID"),
          })).optional(),
          fieldPermissions: z.array(z.object({
            id: z.string().describe("字段 id"),
            read: z.boolean().describe("查看字段权限"),
            edit: z.boolean().describe("编辑字段权限"),
            add: z.boolean().describe("新增字段权限"),
            decrypt: z.boolean().describe("解密字段权限"),
          })).optional(),
          paymentActions: z.object({
            pay: z.string().describe("工作表中付款权限"), // OpenAPI spec says string, but seems like boolean in context
          }),
        }).optional()).optional().describe("工作表权限明细，仅在permissionScope为0时生效"),
        pagePermissions: z.array(z.object({
          id: z.string().describe("自定义页面ID"),
          enable: z.boolean().describe("是否可以查看自定义页面"),
        }).optional()).optional().describe("自定义页面权限明细，仅在permissionScope为0时生效"),
        ai_description: z.string().describe("e.g. Role: <Role Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ name, description, hideAppForMembers, type, permissionScope, globalPermissions, worksheetPermissions, pagePermissions, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app/roles`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ name, description, hideAppForMembers, type, permissionScope, globalPermissions, worksheetPermissions, pagePermissions }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "createWorksheet",
    {
      title: "新建工作表",
      description: "创建工作表，目前支持字段类型有Text|Number|SingleSelect|MultipleSelect|Date|DateTime|Collaborator|Relation|Attachment",
      inputSchema: {
        name: z.string().describe("工作表名称"),
        alias: z.string().optional().describe("工作表别名"),
        sectionId: z.string().optional().describe("分组 id"),
        fields: z.array(
          z.object({
            name: z.string().describe("字段名称"),
            alias: z.string().optional().describe("字段别名"),
            type: z.string().describe("字段类型"),
            isTitle: z.boolean().optional().describe("是否是标题字段"),
            required: z.boolean().describe("是否必填"),
            isHidden: z.boolean().optional().describe("是否隐藏"),
            isReadOnly: z.boolean().optional().describe("是否只读"),
            isHiddenOnCreate: z.boolean().optional().describe("是否新增记录时隐藏"),
            isUnique: z.boolean().optional().describe("是否唯一"),
            precision: z.number().int().min(0).max(14).optional().describe("type=Number时，表示保留小数位（0-14）"),
            subType: z.string().optional().describe("type=Collaborator时，表示成员数量，填入规则 0：单选,1：多选; type=Relation时，表示关联记录数量，填入规则 1：单条 2：多条; type=Time时，表示时间1：时.分 ，6：时.分.秒; type=Date|DateTime时，表示日期：5：年 4：年月 3：年月日 2：年月日时 1：年月日时分 6：年月日时分秒"),
            options: z.array(
              z.object({
                value: z.string().describe("选项名称"),
                index: z.number().int().describe("选项排序"),
              })
            ).optional().describe("type=SingleSelect|MultipleSelect时传入， 11:单选,10:多选时填入"),
            max: z.number().int().min(0).max(10).optional().describe("type=Rating时传入，表示等级最大值，填入规则（0-10）"),
            dataSource: z.string().optional().describe("type=Relation时传入关联表 id，表示关联表 id"),
            relation: z.object({
              showFields: z.array(z.string()).optional().describe("展示字段"),
              bidirectional: z.boolean().optional().describe("是否为双向关联 true：双向，false：单向"),
            }).optional().describe("type=Relation时传入，关联字段字段 配置项"),
          })
        ).describe("工作表字段信息"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ name, alias, sectionId, fields, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app/worksheets`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ name, alias, sectionId, fields }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "deleteOptionset",
    {
      title: "删除选项集",
      description: "删除选项集",
      inputSchema: {
        optionset_id: z.string().describe("选项集 ID"),
        ai_description: z.string().describe("e.g. Optionset: <Optionset Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ optionset_id, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/optionsets/${optionset_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "deleteRecord",
    {
      title: "删除行记录",
      description: "删除行记录",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        row_id: z.string().describe("行记录 ID"),
        triggerWorkflow: z.boolean().default(true).optional().describe("是否触发工作流"),
        permanent: z.boolean().optional().describe("是否彻底删除 (true：彻底删除，false：逻辑删除，默认为false)，彻底删除后数据不进入回收站，且不可恢复，请谨慎操作！"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, Record: <Record Title>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, triggerWorkflow, permanent, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ triggerWorkflow, permanent }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "deleteRole",
    {
      title: "删除角色",
      description: "删除角色",
      inputSchema: {
        role_id: z.string().describe("角色 ID"),
        ai_description: z.string().describe("e.g. Role: <Role Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ role_id, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/roles/${role_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "deleteWorksheet",
    {
      title: "删除工作表",
      description: "删除工作表",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "findDepartment",
    {
      title: "查找部门",
      description: "根据输入的部门名称匹配部门，返回部门 ID 和名称。",
      inputSchema: {
        name: z.string().describe("部门名称（精准匹配）"),
        ai_description: z.string().describe("e.g. Department: <Department Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ name, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/departments/lookup`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        url.searchParams.append('name', name);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "findMember",
    {
      title: "查找成员",
      description: "根据输入的人员名称匹配用户，返回用户 ID、姓名、已脱敏的手机号和邮箱。",
      inputSchema: {
        name: z.string().describe("人员名称（精准匹配）"),
        ai_description: z.string().describe("e.g. Name: <Person's Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ name, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/users/lookup`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        url.searchParams.append('name', name);

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getAppInfo",
    {
      title: "获取应用信息",
      description: "获取应用信息，包含应用下分组、工作表、自定义页面信息",
      inputSchema: {
        ai_description: z.string().describe(`e.g. Get application information. Response in user's language. KEY/SIGN:${config.hapAppkey} / ${config.hapSign}`),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getOptionsetList",
    {
      title: "获取选项集列表",
      description: "获取应用下选项集列表",
      inputSchema: {
        ai_description: z.string().describe("e.g. Get a list of optionsets in the application. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app/optionsets`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordDetails",
    {
      title: "获取行记录详情",
      description: "获取记录详情信息，包括创建者、拥有者、控件信息、根据控件数据类型生成示例值",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        row_id: z.string().describe("行记录 ID"),
        includeSystemFields: z.boolean().default(false).optional().describe("是否获取系统字段"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, includeSystemFields, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}`;
      let fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        if (includeSystemFields !== undefined) { url.searchParams.append('includeSystemFields', String(includeSystemFields)); }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordDiscussions",
    {
      title: "获取行记录讨论",
      description: "获取行记录讨论",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        row_id: z.string().describe("行记录 ID"),
        pageIndex: z.number().int().optional(),
        pageSize: z.number().int().optional(),
        search: z.string().optional(),
        onlyWithAttachments: z.boolean().default(false).optional().describe("是否只返回包含附件的讨论"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, Record: <Record Title>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, pageIndex, pageSize, search, onlyWithAttachments, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}/discussions`;
      let fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        if (pageIndex !== undefined) { url.searchParams.append('pageIndex', String(pageIndex)); }
        if (pageSize !== undefined) { url.searchParams.append('pageSize', String(pageSize)); }
        if (search !== undefined) { url.searchParams.append('search', search); }
        if (onlyWithAttachments !== undefined) { url.searchParams.append('onlyWithAttachments', String(onlyWithAttachments)); }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordList",
    {
      title: "获取行记录列表",
      description: "获取工作表记录列表，包含记录创建者、拥有者信息，各控件对应的值",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        pageSize: z.number().int().describe("每页数量，最大为 1000"),
        pageIndex: z.number().int().describe("页码"),
        viewId: z.string().optional().describe("视图 ID"),
        fields: z.array(z.string()).optional().describe("指定返回字段 id，填入后返回数据中只包含这些字段"),
        filter: z.any().optional().describe("筛选器，复杂对象，请参考文档"),
        sorts: z.array(z.object({
          field: z.string().describe("字段ID或别名"),
          isAsc: z.boolean().optional().describe("是否升序，默认为降序"),
        })).optional().describe("排序字段"),
        search: z.string().optional().describe("关键字模糊搜索"),
        tableView: z.boolean().optional().describe("是否用表格视图格式返回记录数据"),
        useFieldIdAsKey: z.boolean().optional().describe("返回数据时字段名称是否使用ID，默认使用别名"),
        includeTotalCount: z.boolean().default(false).optional().describe("是否返回总记录行数"),
        includeSystemFields: z.boolean().default(false).optional().describe("是否返回系统字段"),
        responseFormat: z.enum(['json', 'md']).optional().describe("json：返回 JSON，md：返回 md 文本(更省 token)。默认为 json"),
        ai_description: z.string().describe("Description of the query parameters, including worksheet, view (if any), filter conditions, sorting, etc. Output detailed field names and condition operators/values. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, pageSize, pageIndex, viewId, fields, filter, sorts, search, tableView, useFieldIdAsKey, includeTotalCount, includeSystemFields, responseFormat, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/list`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ pageSize, pageIndex, viewId, fields, filter, sorts, search, tableView, useFieldIdAsKey, includeTotalCount, includeSystemFields, responseFormat }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordLogs",
    {
      title: "获取行记录日志",
      description: "获取行记录日志",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        row_id: z.string().describe("行记录 ID"),
        operatorIds: z.array(z.string()).optional().describe("操作者 ID"),
        field: z.string().optional().describe("字段 id/别名"),
        pageSize: z.number().int().optional(),
        pageIndex: z.number().int().optional(),
        startDate: z.string().optional().describe("开始日期，格式：yyyy-MM-dd HH:mm:ss"),
        endDate: z.string().optional().describe("结束日期，yyyy-MM-dd HH:mm:ss"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, Record: <Record Title>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, operatorIds, field, pageSize, pageIndex, startDate, endDate, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}/logs`;
      let fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        if (operatorIds !== undefined) { operatorIds.forEach(id => url.searchParams.append('operatorIds', id)); }
        if (field !== undefined) { url.searchParams.append('field', field); }
        if (pageSize !== undefined) { url.searchParams.append('pageSize', String(pageSize)); }
        if (pageIndex !== undefined) { url.searchParams.append('pageIndex', String(pageIndex)); }
        if (startDate !== undefined) { url.searchParams.append('startDate', startDate); }
        if (endDate !== undefined) { url.searchParams.append('endDate', endDate); }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordPivotData",
    {
      title: "获取行记录透视数据",
      description: "获取工作表记录透视表汇总数据",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        pageSize: z.number().int().optional().describe("每页数量，最大为 1000"),
        pageIndex: z.number().int().optional().describe("页码"),
        viewId: z.string().optional().describe("视图 ID"),
        columns: z.array(z.object({
          field: z.string().describe("字段ID"),
          displayName: z.string().optional().describe("显示名称"),
          granularity: z.number().int().optional().describe("日期、地区统计维度: 1-日，2-周，3-月；1-省，2-省/市，3-省/市/县（区）。"),
          includeEmpty: z.boolean().optional().describe("是否统计空值，默认为false不统计"),
        })).optional().describe("列（维度）字段列表"),
        rows: z.array(z.object({
          field: z.string().describe("字段ID"),
          displayName: z.string().optional().describe("显示名称"),
          granularity: z.number().int().optional().describe("日期、地区统计维度: 1-日，2-周，3-月；1-省，2-省/市，3-省/市/县（区）。"),
          includeEmpty: z.boolean().optional().describe("是否统计空值，默认为false不统计"),
        })).optional().describe("行（维度）字段列表"),
        values: z.array(z.object({
          field: z.string().describe("字段ID，当aggregation=COUNT时，field必须为`record_count`"),
          displayName: z.string().optional().describe("显示名称"),
          aggregation: z.string().describe("聚合方式（COUNT, DISTINCTCOUNT, SUM, MIN, MAX, AVG）"),
          includeEmpty: z.boolean().optional().describe("是否统计空值，默认为false不统计，空值将显示为0"),
        })).describe("字段值列表"),
        filter: z.any().optional().describe("筛选器，复杂对象，请参考文档"),
        sorts: z.array(z.object({
          field: z.string().describe("字段ID"),
          isAsc: z.boolean().optional().describe("是否升序，默认为降序"),
        })).optional().describe("排序字段"),
        includeSummary: z.boolean().optional().describe("返回值是否包含所有行汇总值"),
        ai_description: z.string().describe("Description of the query parameters, including worksheet, view (if any), filter conditions, dimensions, values, sorting, etc. Output detailed field names and condition operators/values. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, pageSize, pageIndex, viewId, columns, rows, values, filter, sorts, includeSummary, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/pivot`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ pageSize, pageIndex, viewId, columns, rows, values, filter, sorts, includeSummary }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordRelations",
    {
      title: "获取关联记录",
      description: "获取关联记录列表，包括关联记录来源工作表信息，行记录信息，行记录详细信息，创建者信息",
      inputSchema: {
        worksheet_id: z.string().describe("工作表ID"),
        row_id: z.string().describe("行记录ID"),
        field: z.string().describe("字段 ID/别名"),
        pageSize: z.number().int().optional().describe("行数"),
        pageIndex: z.number().int().optional().describe("页码"),
        isReturnSystemFields: z.boolean().optional().describe("是否获取系统字段"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, Record: <Record Title>, Field: <Field Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, field, pageSize, pageIndex, isReturnSystemFields, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}/relations/${field}`;
      let fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        if (pageSize !== undefined) { url.searchParams.append('pageSize', String(pageSize)); }
        if (pageIndex !== undefined) { url.searchParams.append('pageIndex', String(pageIndex)); }
        if (isReturnSystemFields !== undefined) { url.searchParams.append('isReturnSystemFields', String(isReturnSystemFields)); }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRecordShareLink",
    {
      title: "获取记录分享链接",
      description: "获取记录分享链接",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        row_id: z.string().describe("行记录 ID"),
        visibleFields: z.array(z.string()).optional().describe("可见字段ID集合"),
        expiredIn: z.number().int().optional().describe("单位s,不传或传0表示永久有效"),
        password: z.string().optional().describe("为空表示不需要密码"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, Record: <Record Title>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, visibleFields, expiredIn, password, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}/share-link`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ visibleFields, expiredIn, password }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRegions",
    {
      title: "获取地区信息",
      description: "获取地区信息",
      inputSchema: {
        id: z.string().optional().describe("地区ID"),
        search: z.string().optional().describe("模糊搜索内容"),
        ai_description: z.string().describe("e.g. Region: <Region Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ id, search, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/regions`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        if (id !== undefined) { url.searchParams.append('id', id); }
        if (search !== undefined) { url.searchParams.append('search', search); }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRoleDetails",
    {
      title: "获取角色详情",
      description: "获取角色详情",
      inputSchema: {
        role_id: z.string().describe("角色 ID"),
        ai_description: z.string().describe("e.g. Role: <Role Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ role_id, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/roles/${role_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getRoleList",
    {
      title: "获取角色列表",
      description: "获取应用下角色列表",
      inputSchema: {
        ai_description: z.string().describe("e.g. Get a list of roles in the application. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app/roles`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getWorkflowDetails",
    {
      title: "获取流程详情",
      description: "获取流程详情，包含流程请求参数，响应参数",
      inputSchema: {
        process_id: z.string().describe("流程 ID"),
        ai_description: z.string().describe("e.g. Workflow: <Workflow Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ process_id, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/workflow/processes/${process_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getWorkflowList",
    {
      title: "获取流程列表",
      description: "获取应用下工作流列表",
      inputSchema: {
        ai_description: z.string().describe("e.g. Get a list of workflows in the application. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app/workflow/processes`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getWorksheetsList",
    {
      title: "获取工作表列表",
      description: "获取应用下工作表列表信息",
      inputSchema: {
        responseFormat: z.enum(['json', 'md']).optional().describe("json：返回 JSON，md：返回 md 文本(更省 token)。默认为 json"),
        worksheets: z.array(z.string()).optional().describe("指定返回工作表 id，填入后返回数据中只包含这些工作表信息"),
        ai_description: z.string().describe("e.g. Get the list of worksheets under a specific application. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ responseFormat, worksheets, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      const endpoint = `/v3/app/worksheets/list`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ responseFormat, worksheets }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "getWorksheetStructure",
    {
      title: "获取工作表结构信息",
      description: "获取工作表配置及其控件信息",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        responseFormat: z.enum(['json', 'md']).optional().describe("json：返回 JSON，md：返回 md 文本(更省 token)。默认为 json"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, responseFormat, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}`;
      let fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const url = new URL(fullUrl);
        if (responseFormat !== undefined) { url.searchParams.append('responseFormat', responseFormat); }

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "leaveAllRoles",
    {
      title: "成员退出所有角色",
      description: "将指定成员退出应用下所有角色",
      inputSchema: {
        user_id: z.string().describe("用户 ID"),
        ai_description: z.string().describe("e.g. Member: <Member Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ user_id, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/roles/users/${user_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "removeMemberFromRole",
    {
      title: "移除角色成员",
      description: "移出角色下成员",
      inputSchema: {
        role_id: z.string().describe("角色 ID"),
        operatorId: z.string().describe("操作者ID"),
        userIds: z.array(z.string()).optional().describe("用户账号 ID 列表"),
        departmentIds: z.array(z.string()).optional().describe("部门 ID 列表"),
        departmentTreeIds: z.array(z.string()).optional().describe("部门树 ID 列表"),
        jobIds: z.array(z.string()).optional().describe("职位 ID 列表"),
        orgRoleIds: z.array(z.string()).optional().describe("组织角色 ID 列表"),
        ai_description: z.string().describe("e.g. Role: <Role Name>, Remove Member: <(Type) Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ role_id, operatorId, userIds, departmentIds, departmentTreeIds, jobIds, orgRoleIds, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/roles/${role_id}/members`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ operatorId, userIds, departmentIds, departmentTreeIds, jobIds, orgRoleIds }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  ); // Added missing closing parenthesis and semicolon

  server.registerTool(
    "triggerWorkflow",
    {
      title: "触发流程",
      description: "触发流程",
      inputSchema: {
        process_id: z.string().describe("流程 ID"),
        inputs: z.any().describe("流程的输入参数及对应的值"),
        ai_description: z.string().describe("e.g. Workflow: <Workflow Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ process_id, inputs, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/workflow/hooks/${process_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ ['{inputs}']: inputs }), // Use the exact key from OpenAPI spec with bracket notation
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "updateOptionset",
    {
      title: "编辑选项集",
      description: "编辑选项集",
      inputSchema: {
        optionset_id: z.string().describe("选项集 ID"),
        name: z.string().describe("选项集名称"),
        options: z.array(
          z.object({
            key: z.string().describe("选项的Key"),
            value: z.string().describe("选项值，不允许重复"),
            index: z.number().int().describe("选项排序值: 必须为整数，越小越靠前"),
            isDeleted: z.boolean().describe("该选项是否已被删除"),
            color: z.string().describe("颜色值: colorful为true时生效，参考值 #C0E6FC , #C3F2F2 , #00C345 , #FAD714 , #FF9300 , #F52222 , #EB2F96 , #7500EA , #2D46C4 , #484848 , #C9E6FC , #C3F2F2"),
            score: z.number().describe("分值，enableScore为true时生效，允许小数和正负值"),
          })
        ).describe("选项集"),
        enableColor: z.boolean().describe("启用彩色"),
        enableScore: z.boolean().describe("启用分值"),
        ai_description: z.string().describe("e.g. Optionset: <Optionset Name>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ optionset_id, name, options, enableColor, enableScore, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/optionsets/${optionset_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ name, options, enableColor, enableScore }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "updateRecord",
    {
      title: "更新行记录",
      description: "更新行记录",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        row_id: z.string().describe("行记录 ID"),
        fields: z.array(
          z.object({
            id: z.string().describe("字段 ID /别名"),
            value: z.any().describe("字段值，Attachment类型字段示例传参：[{\"name\":\"文件名称，带后缀\",\"url\":\" url/base64\"}]"),
            type: z.string().optional().describe("SingleSelect/MultipleSelect:1=不增量选项，2=允许增加选项，默认为1; Attachment:0=覆盖，1=新增，默认为 0.")
          })
        ).describe("字段列表"),
        triggerWorkflow: z.boolean().default(true).optional().describe("是否触发工作流"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, Record: <Record Title>. Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, row_id, fields, triggerWorkflow, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}/rows/${row_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ fields, triggerWorkflow }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );

  server.registerTool(
    "updateWorksheet",
    {
      title: "编辑工作表",
      description: "编辑工作表",
      inputSchema: {
        worksheet_id: z.string().describe("工作表 ID"),
        name: z.string().optional().describe("工作表名称"),
        alias: z.string().optional().describe("工作表别名"),
        sectionId: z.string().optional().describe("分组 id"),
        addFields: z.array(z.object({
          name: z.string().describe("字段名称"),
          alias: z.string().optional().describe("字段别名"),
          type: z.string().describe("字段类型"),
          isTitle: z.boolean().optional().describe("是否是标题字段"),
          required: z.boolean().describe("是否必填"),
          isHidden: z.boolean().optional().describe("是否隐藏"),
          isReadOnly: z.boolean().optional().describe("是否只读"),
          isHiddenOnCreate: z.boolean().optional().describe("是否新增记录时隐藏"),
          isUnique: z.boolean().optional().describe("是否唯一"),
          precision: z.number().int().min(0).max(14).optional().describe("type=Number时，表示保留小数位（0-14）"),
          subType: z.string().optional().describe("type=Collaborator时，表示成员数量，填入规则 0：单选,1：多选; type=Relation时，表示关联记录数量，填入规则 1：单条 2：多条; type=Time时，表示时间1：时.分 ，6：时.分.秒; type=Date|DateTime时，表示日期：5：年 4：年月 3：年月日 2：年月日时 1：年月日时分 6：年月日时分秒"),
          options: z.array(z.object({
            value: z.string().describe("选项名称"),
            index: z.number().int().describe("选项排序"),
          })).optional().describe("type=SingleSelect|MultipleSelect时传入， 11:单选,10:多选时填入"),
          max: z.number().int().min(0).max(10).optional().describe("type=Rating时传入，表示等级最大值，填入规则（0-10）"),
          dataSource: z.string().optional().describe("type=Relation时传入关联表 id，表示关联表 id"),
          relation: z.object({
            showFields: z.array(z.string()).optional().describe("展示字段"),
            bidirectional: z.boolean().optional().describe("是否为双向关联 true：双向，false：单向"),
          }).optional().describe("type=Relation时传入，关联字段字段 配置项"),
        })).optional().describe("新增的字段"),
        editFields: z.array(z.object({
          id: z.string().describe("字段 id/别名"),
          name: z.string().optional().describe("字段名称"),
          alias: z.string().optional().describe("字段别名"),
          type: z.string().optional().describe("字段类型"),
          isTitle: z.boolean().optional().describe("是否是标题字段"),
          required: z.boolean().optional().describe("是否必填"),
          isHidden: z.boolean().optional().describe("是否隐藏"),
          isReadOnly: z.boolean().optional().describe("是否只读"),
          isHiddenOnCreate: z.boolean().optional().describe("是否新增记录时隐藏"),
          isUnique: z.boolean().optional().describe("是否唯一"),
          precision: z.number().int().min(0).max(14).optional().describe("type=Number时，表示保留小数位（0-14）"),
          subType: z.string().optional().describe("type=Collaborator时，表示成员数量，填入规则 0：单选,1：多选; type=Relation时，表示关联记录数量，填入规则 1：单条 2：多条; type=Time时，表示时间1：时.分 ，6：时.分.秒; type=Date|DateTime时，表示日期：5：年 4：年月 3：年月日 2：年月日时 1：年月日时分 6：年月日时分秒"),
          options: z.array(z.object({
            value: z.string().describe("选项名称"),
            index: z.number().int().describe("选项排序"),
          })).optional().describe("type=SingleSelect|MultipleSelect时传入，表示选项信息"),
          max: z.number().int().min(0).max(10).optional().describe("type=Rating时传入，表示等级最大值，填入规则（0-10）"),
          dataSource: z.string().optional().describe("type=Relation时传入关联表 id，表示关联表 id"),
          relation: z.object({
            showFields: z.array(z.string()).optional().describe("展示字段"),
          }).optional().describe("type=Relation时传入，关联字段字段 配置项"),
        })).optional().describe("编辑的字段"),
        removeFields: z.array(z.string()).optional().describe("删除的字段"),
        ai_description: z.string().describe("e.g. Worksheet: <Worksheet Name>, add fields (if any), modify fields (if any), delete fields (if any). Response in user's language."),
      },
      // ⚠️ 不写 outputSchema，避免类型校验输出结构
    },
    async ({ worksheet_id, name, alias, sectionId, addFields, editFields, removeFields, ai_description }, extra) => {
      const apiBaseUrl = config.apiBaseUrl;
      let endpoint = `/v3/app/worksheets/${worksheet_id}`;
      const fullUrl = `${apiBaseUrl}${endpoint}`;

      const hapAppkey = config.hapAppkey;
      const hapSign = config.hapSign;

      if (!hapAppkey || !hapSign) {
        return {
          content: [{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }],
        };
      }

      try {
        const response = await fetch(fullUrl, {
          method: "POST", // OpenAPI spec says POST for update worksheet
          headers: {
            "Content-Type": "application/json",
            "HAP-Appkey": hapAppkey,
            "HAP-Sign": hapSign,
          },
          body: JSON.stringify({ name, alias, sectionId, addFields, editFields, removeFields }),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: JSON.stringify({ error: result.error_msg || "Unknown error", statusCode: response.status }) }],
          };
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        return {
          content: [{ type: "text", text: `Error calling external API: ${error.message}` }],
        };
      }
    }
  );


  // The scaffold also includes example resources and prompts
  // server.registerResource(...) 
  // server.registerPrompt(...)

  return server.server;
}
