#!/bin/bash

# HAP API Documentation Update Script - Enhanced Version
# This script downloads all 35 API documentation files and processes them with:
# 1. Remove HAP-Appid and Authorization headers
# 2. Remove all examples
# 3. Resolve x-apifox-refs and remove all x-apifox attributes

set -e  # Exit on any error

echo "🚀 Starting HAP API Documentation Update (Enhanced Version)..."

# Define arrays for URLs and corresponding filenames
urls=(
    # Application APIs
    "https://apifox.mingdao.com/339496583e0.md"

    # Worksheet APIs
    "https://apifox.mingdao.com/359328827e0.md"
    "https://apifox.mingdao.com/339496584e0.md"
    "https://apifox.mingdao.com/339496585e0.md"
    "https://apifox.mingdao.com/339496586e0.md"
    "https://apifox.mingdao.com/339496587e0.md"

    # Record APIs
    "https://apifox.mingdao.com/339496588e0.md"
    "https://apifox.mingdao.com/339496589e0.md"
    "https://apifox.mingdao.com/339496590e0.md"
    "https://apifox.mingdao.com/339496591e0.md"
    "https://apifox.mingdao.com/339496592e0.md"
    "https://apifox.mingdao.com/339496593e0.md"
    "https://apifox.mingdao.com/339496594e0.md"
    "https://apifox.mingdao.com/339496595e0.md"
    "https://apifox.mingdao.com/339496596e0.md"
    "https://apifox.mingdao.com/339496597e0.md"
    "https://apifox.mingdao.com/339496598e0.md"
    "https://apifox.mingdao.com/339496599e0.md"
    "https://apifox.mingdao.com/339496600e0.md"

    # OptionSet APIs
    "https://apifox.mingdao.com/339496601e0.md"
    "https://apifox.mingdao.com/339496602e0.md"
    "https://apifox.mingdao.com/339496603e0.md"
    "https://apifox.mingdao.com/339496604e0.md"

    # Workflow APIs
    "https://apifox.mingdao.com/339496605e0.md"
    "https://apifox.mingdao.com/339496606e0.md"
    "https://apifox.mingdao.com/339496607e0.md"

    # Role APIs
    "https://apifox.mingdao.com/339496608e0.md"
    "https://apifox.mingdao.com/339496609e0.md"
    "https://apifox.mingdao.com/339496610e0.md"
    "https://apifox.mingdao.com/339496611e0.md"
    "https://apifox.mingdao.com/339496612e0.md"
    "https://apifox.mingdao.com/339496613e0.md"
    "https://apifox.mingdao.com/339496614e0.md"

    # PublicQuery APIs
    "https://apifox.mingdao.com/339496615e0.md"
    "https://apifox.mingdao.com/339496616e0.md"
    "https://apifox.mingdao.com/339496617e0.md"
)

filenames=(
# Application APIs
    "get_app_info.yaml"

    # Worksheet APIs
    "get_worksheet_list.yaml"
    "get_worksheet_structure.yaml"
    "update_worksheet.yaml"
    "delete_worksheet.yaml"
    "create_worksheet.yaml"

    # Record APIs
    "get_record_list.yaml"
    "get_record_details.yaml"
    "update_record.yaml"
    "delete_record.yaml"
    "get_record_relations.yaml"
    "create_record.yaml"
    "batch_create_records.yaml"
    "batch_update_records.yaml"
    "batch_delete_records.yaml"
    "get_record_pivot_data.yaml"
    "get_record_share_link.yaml"
    "get_record_logs.yaml"
    "get_record_discussions.yaml"

    # OptionSet APIs
    "get_optionset_list.yaml"
    "create_optionset.yaml"
    "update_optionset.yaml"
    "delete_optionset.yaml"

    # Workflow APIs
    "get_workflow_list.yaml"
    "get_workflow_details.yaml"
    "trigger_workflow.yaml"

    # Role APIs
    "get_role_list.yaml"
    "create_role.yaml"
    "get_role_details.yaml"
    "delete_role.yaml"
    "add_member_to_role.yaml"
    "remove_member_from_role.yaml"
    "leave_all_roles.yaml"

    # PublicQuery APIs
    "find_member.yaml"
    "find_department.yaml"
    "get_regions.yaml"
)

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "📍 Working directory: $SCRIPT_DIR"

# Check dependencies
echo "🔍 Checking dependencies..."
if ! command -v python3 >/dev/null 2>&1; then
    echo "  ❌ Python3 not found. Please install Python3 first."
    exit 1
fi

# Check if PyYAML is installed
if ! python3 -c "import yaml" 2>/dev/null; then
    echo "  📦 PyYAML not found, installing..."
    pip3 install PyYAML --break-system-packages --user 2>/dev/null || pip install PyYAML --user 2>/dev/null || {
        echo "  ⚠️  Could not install PyYAML automatically. Please install it manually:"
        echo "     pip3 install PyYAML --user"
        exit 1
    }
    echo "  ✅ PyYAML installed successfully"
else
    echo "  ✅ PyYAML found"
fi

# Create YAML processing script
echo "🛠️  Creating YAML processing script..."
cat > process_yaml.py << 'EOF'
#!/usr/bin/env python3
import yaml
import json
import sys
import re

def resolve_refs(data, components):
    """递归解析 x-apifox-refs 引用"""
    if isinstance(data, dict):
        # 检查是否有 x-apifox-refs
        if 'x-apifox-refs' in data:
            refs = data['x-apifox-refs']
            for ref_key, ref_data in refs.items():
                if '$ref' in ref_data:
                    # 解析引用路径，例如 '#/components/schemas/obj_base_return'
                    ref_path = ref_data['$ref']
                    if ref_path.startswith('#/components/schemas/'):
                        schema_name = ref_path.replace('#/components/schemas/', '')
                        if components and 'schemas' in components and schema_name in components['schemas']:
                            # 将引用的内容合并到当前对象
                            schema_content = components['schemas'][schema_name]
                            # 递归解析引用内容
                            schema_content = resolve_refs(schema_content, components)
                            # 合并属性
                            if 'properties' in schema_content and 'properties' in data:
                                data['properties'].update(schema_content['properties'])
                            elif 'properties' in schema_content:
                                data['properties'] = schema_content['properties']
                            # 合并required字段
                            if 'required' in schema_content:
                                if 'required' in data:
                                    data['required'].extend([r for r in schema_content['required'] if r not in data['required']])
                                else:
                                    data['required'] = schema_content['required'][:]

        # 递归处理所有嵌套对象
        for key, value in list(data.items()):
            data[key] = resolve_refs(value, components)
    elif isinstance(data, list):
        for i in range(len(data)):
            data[i] = resolve_refs(data[i], components)

    return data

def clean_yaml_content(data):
    """清理YAML内容"""
    if isinstance(data, dict):
        # 创建新字典来存储清理后的内容
        cleaned = {}
        for key, value in data.items():
            # 跳过所有 x-apifox 开头的属性
            if key.startswith('x-apifox'):
                continue
            # 跳过 x-run-in-apifox 属性
            if key == 'x-run-in-apifox':
                continue
            # 跳过 example 和 examples 属性
            if key in ['example', 'examples']:
                continue
            # 递归清理嵌套内容
            cleaned[key] = clean_yaml_content(value)
        return cleaned
    elif isinstance(data, list):
        return [clean_yaml_content(item) for item in data]
    else:
        return data

def process_parameters(data):
    """处理parameters，移除特定的header"""
    if isinstance(data, dict):
        if 'parameters' in data:
            # 过滤掉HAP-Appid和Authorization header
            filtered_params = []
            for param in data['parameters']:
                if param.get('in') == 'header' and param.get('name') in ['HAP-Appid', 'Authorization']:
                    continue
                filtered_params.append(param)
            data['parameters'] = filtered_params

        # 递归处理所有嵌套对象
        for key, value in data.items():
            data[key] = process_parameters(value)
    elif isinstance(data, list):
        for i in range(len(data)):
            data[i] = process_parameters(data[i])

    return data

def process_servers(data):
    """处理servers，只保留正式环境的URL"""
    if isinstance(data, dict):
        if 'servers' in data and isinstance(data['servers'], list):
            # 只保留正式环境的服务器
            official_servers = []
            for server in data['servers']:
                if isinstance(server, dict) and 'url' in server:
                    # 只保留 https://api.mingdao.com 的服务器
                    if server['url'] == 'https://api.mingdao.com':
                        official_servers.append(server)
            data['servers'] = official_servers

        # 递归处理所有嵌套对象
        for key, value in data.items():
            data[key] = process_servers(value)
    elif isinstance(data, list):
        for i in range(len(data)):
            data[i] = process_servers(data[i])

    return data

def main():
    try:
        with open(sys.argv[1], 'r', encoding='utf-8') as f:
            data = yaml.safe_load(f)

        # 先解析引用
        components = data.get('components', {})
        data = resolve_refs(data, components)

        # 处理parameters
        data = process_parameters(data)

        # 处理servers
        data = process_servers(data)

        # 清理内容
        data = clean_yaml_content(data)

        # 输出处理后的YAML
        with open(sys.argv[2], 'w', encoding='utf-8') as f:
            yaml.dump(data, f, default_flow_style=False, allow_unicode=True, sort_keys=False)

    except Exception as e:
        print(f"Error processing {sys.argv[1]}: {e}")
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 process_yaml.py input.yaml output.yaml")
        sys.exit(1)
    main()
EOF

chmod +x process_yaml.py

# Create backup directory with timestamp
backup_dir="backup_$(date +%Y%m%d_%H%M%S)"
if ls *.yaml >/dev/null 2>&1; then
    echo "📦 Creating backup of existing files in $backup_dir/"
    mkdir -p "$backup_dir"
    mv *.yaml "$backup_dir/" 2>/dev/null || true
fi

echo "📥 Downloading and processing API documentation files..."

# Verify arrays have the same length
if [ ${#urls[@]} -ne ${#filenames[@]} ]; then
    echo "❌ Error: URLs and filenames arrays have different lengths"
    exit 1
fi

# Download and process all API documentation files
download_count=0
processed_count=0
total_apis=${#urls[@]}

for i in "${!urls[@]}"; do
    url="${urls[i]}"
    filename="${filenames[i]}"
    echo "  📄 Processing $filename..."

    # Download raw markdown
    if curl -s "$url" -o "${filename}.tmp"; then
        # Extract YAML content from markdown code blocks
        if sed -n '/```yaml/,/```/p' "${filename}.tmp" | sed '1d;$d' > "${filename}.raw"; then
            ((download_count++))
            echo "    📥 Downloaded successfully"

            # Process YAML with cleaning logic
            if python3 process_yaml.py "${filename}.raw" "$filename"; then
                ((processed_count++))
                echo "    🧹 Processed successfully"
                # Clean up temporary files
                rm -f "${filename}.tmp" "${filename}.raw"
            else
                echo "    ❌ Failed to process YAML"
            fi
        else
            echo "    ❌ Failed to extract YAML from markdown"
        fi
    else
        echo "    ❌ Failed to download from $url"
    fi
done

# Clean up processing script
rm -f process_yaml.py

echo ""
echo "📊 Processing Summary:"
echo "  Total APIs: $total_apis"
echo "  Successfully downloaded: $download_count"
echo "  Successfully processed: $processed_count"

if [ $processed_count -ne $total_apis ]; then
    echo "  ⚠️  Some files failed to process. Check the output above for details."
fi

# Validate processed files
echo ""
echo "🔍 Validating processed YAML files..."
valid_count=0
for filename in *.yaml; do
    if [ -f "$filename" ]; then
        # Check if file is not empty and starts with 'openapi:'
        if [ -s "$filename" ] && head -1 "$filename" | grep -q "^openapi:"; then
            ((valid_count++))
        else
            echo "  ❌ Invalid YAML format: $filename"
        fi
    fi
done

echo "  Valid YAML files: $valid_count"

# Final summary
echo ""
echo "🎉 Enhanced API Documentation Update Complete!"
echo ""
echo "📈 Results:"
echo "  • Downloaded: $download_count/$total_apis files"
echo "  • Processed: $processed_count/$total_apis files"
echo "  • Valid YAML: $valid_count files"
if [ -d "$backup_dir" ]; then
    echo "  • Backup created: $backup_dir/"
fi

echo ""
echo "✨ Enhancement Features Applied:"
echo "  • ❌ Removed HAP-Appid and Authorization headers"
echo "  • ❌ Removed all example/examples attributes"
echo "  • 🔗 Resolved x-apifox-refs references"
echo "  • 🧹 Cleaned all x-apifox-* attributes"

echo ""
echo "📋 File breakdown:"
echo "  • Application APIs: 1 file"
echo "  • Worksheet APIs: 5 files"
echo "  • Record APIs: 13 files"
echo "  • Workflow APIs: 3 files"
echo "  • OptionSet APIs: 4 files"
echo "  • Role APIs: 7 files"
echo "  • PublicQuery APIs: 3 files"
echo ""

if [ $processed_count -eq $total_apis ] && [ $valid_count -eq $processed_count ]; then
    echo "✅ All API documentation files updated and processed successfully!"
    exit 0
else
    echo "⚠️  Some issues occurred during the update process."
    exit 1
fi
