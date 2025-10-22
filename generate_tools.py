# -*- coding: utf-8 -*-
# generate_tools.py
import yaml
import json
import re
import os
import sys

# Import inflection at the top level
try:
    import inflection
except ImportError:
    print("inflection is not installed. Attempting to install...")
    try:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "inflection", "--break-system-packages", "--user"])
        import inflection # Re-import after successful installation
        print("inflection installed successfully.")
    except Exception as e:
        print("Error installing inflection: {}".format(e))
        print("Please install inflection manually: pip install inflection")
        sys.exit(1) # Exit if installation fails

def openapi_type_to_zod_type(schema, components=None):
    """Converts an OpenAPI schema object to a Zod type string."""
    zod_types = []

    # Handle $ref first
    if '$ref' in schema:
        ref_path = schema['$ref']
        if ref_path.startswith('#/components/schemas/') and components:
            schema_name = ref_path.replace('#/components/schemas/', '')
            if schema_name in components.get('schemas', {}):
                zod_types.append(openapi_type_to_zod_type(components['schemas'][schema_name], components))
            else:
                zod_types.append("z.any()") # Fallback for unresolvable references
        else:
            zod_types.append("z.any()") # Fallback for unresolvable references

    # Handle oneOf
    if 'oneOf' in schema:
        for sub_schema in schema['oneOf']:
            zod_types.append(openapi_type_to_zod_type(sub_schema, components))

    # Handle type
    if 'type' in schema:
        if schema['type'] == 'string':
            zod_type = "z.string()"
            if 'format' in schema and schema['format'] == 'date-time':
                zod_type = "z.string().datetime()"
            zod_types.append(zod_type)
        elif schema['type'] == 'integer' or schema['type'] == 'number':
            zod_types.append("z.number()")
        elif schema['type'] == 'boolean':
            zod_types.append("z.boolean()")
        elif schema['type'] == 'array':
            items_schema = schema.get('items', {})
            item_zod_type = openapi_type_to_zod_type(items_schema, components)
            zod_types.append("z.array({})".format(item_zod_type))
        elif schema['type'] == 'object':
            properties = schema.get('properties', {})
            props_zod = []
            for prop_name, prop_schema in properties.items():
                prop_zod = openapi_type_to_zod_type(prop_schema, components)
                if prop_name in schema.get('required', []):
                    props_zod.append("'{0}': {1}".format(prop_name, prop_zod))
                else:
                    props_zod.append("'{0}': {1}.optional()".format(prop_name, prop_zod))
            zod_types.append("z.object({{{}}})".format(', '.join(props_zod)))
        elif schema['type'] == 'null':
            zod_types.append("z.null()")
        else:
            zod_types.append("z.any()") # Fallback for unknown types
    
    # If no specific type was determined but it's not a ref or oneOf, default to any.
    if not zod_types and not ('$ref' in schema or 'oneOf' in schema):
        zod_types.append("z.any()")

    # Remove duplicates while preserving order
    zod_types = list(dict.fromkeys(zod_types))

    final_zod_type = ""
    if len(zod_types) == 1:
        final_zod_type = zod_types[0]
    elif len(zod_types) > 1:
        final_zod_type = "z.union([{}])".format(', '.join(zod_types))
    else:
        final_zod_type = "z.any()" # Should not happen if previous logic is correct

    # Handle default values if present
    if 'default' in schema:
        default_value = schema['default']
        if isinstance(default_value, bool):
            final_zod_type += ".default({})".format('true' if default_value else 'false')
        elif isinstance(default_value, str):
            final_zod_type += ".default('{}')".format(default_value.replace("'", "\\'"))
        elif isinstance(default_value, (int, float)):
            final_zod_type += ".default({})".format(default_value)
        else:
            try:
                json_string = json.dumps(default_value)
                final_zod_type += ".default(JSON.parse('{}'))".format(json_string)
            except TypeError:
                print("Warning: Could not serialize default value {} to JSON for schema {}".format(default_value, schema))
                pass

    return final_zod_type

def generate_tool_code(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        spec = yaml.safe_load(f)

    tool_codes = []
    components = spec.get('components', {})

    for path, path_item in spec.get('paths', {}).items():
        for method, operation in path_item.items():
            if method not in ['get', 'post', 'put', 'delete', 'patch']:
                continue

            # Escape description and summary properly
            summary = re.sub(r'\s+', ' ', operation.get('summary', '')).replace("'", "\\'")
            description = re.sub(r'\s+', ' ', operation.get('description', summary)).replace("'", "\\'")
            
            # Initialize desc_example with a default value
            desc_example = summary.replace("'", "\\'")

            # Generate a more descriptive tool name
            tool_name_base = operation.get('operationId') or operation.get('summary')
            
            clean_tool_name = ""
            if tool_name_base:
                clean_tool_name = re.sub(r'[^a-zA-Z0-9_]', ' ', tool_name_base).strip()
            
            if clean_tool_name:
                tool_name = inflection.camelize(clean_tool_name, uppercase_first_letter=False)
            else:
                # Fallback if no operationId or summary, or if it's empty after cleanup
                fallback_name = "{}_{}".format(method, os.path.basename(file_path).split('.')[0].replace('-', '_'))
                tool_name = inflection.camelize(fallback_name, uppercase_first_letter=False)
                print("Warning: Fallback tool_name used for {}: {}".format(file_path, tool_name))

            # Ensure tool_name is not empty (this check might be redundant now but good for safety)
            if not tool_name:
                tool_name = "{}_fallback_{}".format(method, os.path.basename(file_path).split('.')[0].replace('-', '_'))
                tool_name = inflection.camelize(tool_name, uppercase_first_letter=False)
                print("Warning: Double fallback tool_name used for {}: {}".format(file_path, tool_name))

            # Input Schema
            input_properties = {}
            input_required = []

            # Path parameters
            for param in operation.get('parameters', []):
                if param.get('in') == 'path':
                    param_name = param['name']
                    input_properties[param_name] = openapi_type_to_zod_type(param.get('schema', {}), components)
                    if param.get('required'):
                        input_required.append(param_name)
                elif param.get('in') == 'query':
                    param_name = param['name']
                    input_properties[param_name] = openapi_type_to_zod_type(param.get('schema', {}), components)
                    if param.get('required'):
                        input_required.append(param_name)

            # Request Body
            request_body = operation.get('requestBody')
            if request_body:
                content = request_body.get('content', {})
                json_content = content.get('application/json', {})
                schema = json_content.get('schema', {})
                if schema:
                    body_properties = schema.get('properties', {})
                    for prop_name, prop_schema in body_properties.items():
                        # Special handling for '{inputs}' parameter
                        if prop_name == '{inputs}':
                            input_properties['inputs'] = openapi_type_to_zod_type(prop_schema, components)
                            if prop_name in schema.get('required', []):
                                input_required.append('inputs') # Add 'inputs' as required
                        else:
                            input_properties[prop_name] = openapi_type_to_zod_type(prop_schema, components)
                            if prop_name in schema.get('required', []):
                                input_required.append(prop_name)
            
            input_properties['ai_description'] = "z.string().describe('{}')".format(desc_example)
            input_required.append('ai_description')


        # Construct input schema string
        input_schema_parts = []
        for prop_name, zod_type_str in input_properties.items():
            # Ensure the key in the Zod object is just 'inputs', not '{inputs}'
            if prop_name == '{inputs}': 
                input_schema_parts.append("'inputs': {}".format(zod_type_str))
            elif prop_name in input_required:
                input_schema_parts.append("'{0}': {1}".format(prop_name, zod_type_str))
            else:
                input_schema_parts.append("'{0}': {1}.optional()".format(prop_name, zod_type_str))
        
        input_schema_str = "z.object({{{}}})".format(', '.join(input_schema_parts))
        
        # Collect handler parameters, excluding ai_description from direct destructuring
        handler_params_list = []
        for p_name_key in input_properties.keys(): # Iterate over actual keys in input_properties
            p_name_var = p_name_key # Default to using the key as the variable name
            if p_name_key == '{inputs}': # If the key is '{inputs}', the variable name should be 'inputs'
                p_name_var = 'inputs'
            
            if p_name_var != 'ai_description':
                handler_params_list.append(p_name_var.strip("'")) # Ensure variable names are clean
        
        handler_params_destructured = ", ".join(handler_params_list)

        # Inside the handler's console.log (for debugging)
        log_params = ", ".join([p.strip("'") if p != '{inputs}' else "inputs" for p in input_properties.keys() if p != 'ai_description'])


        tool_code = """
    server.registerTool(
        "{tool_name}",
        {{
            title: "{summary}",
            description: "{description}",
            inputSchema: {input_schema_str},
            // ⚠️ 不写 outputSchema，避免类型校验输出结构
        }},
        async ({{ {handler_params_destructured} }}, {{ ai_description, config }}) => {{
            const apiBaseUrl = "https://api.mingdao.com"; // Base URL from OpenAPI spec
            let endpoint = `{path}`;
            {path_param_logic}
            let fullUrl = `${{apiBaseUrl}}${{endpoint}}`;
            {query_param_str}

            const hapAppkey = config.hapAppkey;
            const hapSign = config.hapSign;

            if (!hapAppkey || !hapSign) {{
                return {{
                    content: [{{ type: "text", text: "Error: HAP-Appkey or HAP-Sign missing in server config." }}],
                }};
            }}

            {request_body_logic}
            const fetchOptions = {{
                method: '{method_upper}',
                headers: {{
                    "Content-Type": "application/json",
                    "HAP-Appkey": hapAppkey,
                    "HAP-Sign": hapSign,
                }},
                {body_json_stringify}
            }};

            try {{
                const response = await fetch(fullUrl, fetchOptions);
                const result = await response.json();

                if (!response.ok) {{
                    return {{
                        content: [{{ type: "text", text: JSON.stringify({{ error: result.error_msg || "Unknown error", statusCode: response.status }}) }}],
                    }};
                }}

                return {{ content: [{{ type: "text", text: JSON.stringify(result) }}] }};

            }} catch (error) {{
                return {{
                    content: [{{ type: "text", text: `Error calling external API: ${{error.message}}` }}],
                }};
            }}
        }},
    )""".format(
            tool_name=tool_name,
            summary=summary,
            description=description,
            input_schema_str=input_schema_str,
            handler_params_destructured=handler_params_destructured,
            path=path,
            path_param_logic=path_param_logic,
            query_param_str=query_param_str,
            request_body_logic=request_body_logic,
            method_upper=method.upper(),
            body_json_stringify=( "body: JSON.stringify(requestBody)," if (has_request_body and method.upper() in ['POST', 'PUT', 'PATCH']) else "" )
        )
        tool_codes.append(tool_code)
    return "\n".join(tool_codes)

def main():
    api_docs_dir = 'api_docs'
    output_file_path = 'hap-mcp/src/index.ts'
    generated_tools = []

    # Check if PyYAML is installed
    try:
        import yaml
    except ImportError:
        print("PyYAML is not installed. Please install it using 'pip install PyYAML'")
        return

    # Check if inflection is installed
    try:
        import inflection
    except ImportError:
        print("inflection is not installed. Attempting to install...")
        try:
            import subprocess
            subprocess.check_call([sys.executable, "-m", "pip", "install", "inflection", "--break-system-packages", "--user"])
            import inflection
            print("inflection installed successfully.")
        except Exception as e:
            print("Error installing inflection: {}".format(e))
            print("Please install inflection manually: pip install inflection")
            sys.exit(1) # Exit if installation fails

    for filename in os.listdir(api_docs_dir):
        if filename.endswith('.yaml'):
            full_path = os.path.join(api_docs_dir, filename)
            print("Generating tool code for {}...".format(filename))
            generated_tools.append(generate_tool_code(full_path))

    # Read the original index.ts content
    with open(output_file_path, 'r', encoding='utf-8') as f:
        original_content = f.read()

    # Find the insertion point: before "// The scaffold also includes example resources and prompts"
    insertion_marker = "  // The scaffold also includes example resources and prompts"
    insert_index = original_content.find(insertion_marker)

    if insert_index == -1:
        print("Error: Could not find insertion marker in index.ts.")
        return

    # Add proper indentation and comments for the generated tools
    indented_generated_tools = ""
    if generated_tools:
        indented_generated_tools = "\n  // --- Generated API Tools ---\n" + "\n".join(generated_tools) + "\n  // --- End Generated API Tools ---\n\n"

    final_content = original_content[:insert_index] + indented_generated_tools + original_content[insert_index:]

    # Write the updated content back to index.ts
    with open(output_file_path, 'w', encoding='utf-8') as f:
        f.write(final_content)

    print("Generated tool code and updated hap-mcp/src/index.ts")

if __name__ == '__main__':
    main()
