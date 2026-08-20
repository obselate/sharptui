using System.Reflection;
using System.Runtime.CompilerServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Xml.Linq;

var root = FindRoot();
var assemblyPath = Path.Combine(root, "bin", "Release", "net10.0", "SharpTui.Framework.dll");
var allowlistPath = Path.Combine(root, "api", "PublicApi.allowlist.txt");
var snapshotPath = Path.Combine(root, "api", "PublicApi.snapshot.txt");
var symbolSnapshotPath = Path.Combine(root, "api", "PublicApi.symbols.sha256");
var documentationPaths = new[]
{
    Path.ChangeExtension(assemblyPath, ".xml"),
    Path.Combine(root, "api", "PublicApi.documentation.xml"),
};
var print = args.Contains("--print", StringComparer.Ordinal);
var printSymbols = args.Contains("--print-symbols", StringComparer.Ordinal);
var printDocs = args.Contains("--print-docs", StringComparer.Ordinal);

if (!File.Exists(assemblyPath))
    throw new FileNotFoundException("Build SharpTui.Framework in Release mode before inspecting its API.", assemblyPath);
var assemblyTime = File.GetLastWriteTimeUtc(assemblyPath);
var newerInput = FrameworkInputs(root)
    .Where(path => File.GetLastWriteTimeUtc(path) > assemblyTime)
    .Order(StringComparer.Ordinal)
    .FirstOrDefault();
if (newerInput != null)
{
    Console.Error.WriteLine($"Framework assembly is stale. Build SharpTui.Framework in Release mode first: {newerInput}");
    Environment.ExitCode = 1;
    return;
}

var assembly = Assembly.LoadFrom(assemblyPath);
var exportedTypes = assembly.GetExportedTypes()
    .OrderBy(type => type.FullName, StringComparer.Ordinal)
    .ToArray();
var types = exportedTypes
    .Where(type => !IsCompilerContainer(type))
    .ToArray();
var names = types.Select(TypeName).ToArray();
var snapshot = string.Join("\n", types.Select(DescribeType)) + "\n";
var symbols = string.Join("\n", exportedTypes.SelectMany(DescribeSymbols)) + "\n";
var symbolHash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(symbols))).ToLowerInvariant() + "\n";

if (print)
{
    Console.Write(snapshot);
    return;
}

if (printSymbols)
{
    Console.Write(symbols);
    return;
}

if (printDocs)
{
    Console.Write(RenderMarkdown(types, LoadDocumentation(documentationPaths), symbolHash.Trim()));
    return;
}

var failures = new List<string>();
CheckExactList(allowlistPath, names, "allowlist", failures);
CheckExactText(snapshotPath, snapshot, failures);
CheckExactText(symbolSnapshotPath, symbolHash, failures);
CheckGeneratedMembers(exportedTypes, failures);
CheckExampleTypes(root, names, failures);
CheckDocumentation(types, documentationPaths, failures);

if (failures.Count != 0)
{
    foreach (var failure in failures)
        Console.Error.WriteLine(failure);
    Environment.ExitCode = 1;
    return;
}

Console.WriteLine($"api surface: ok ({names.Length} public types; XML documentation complete)");

static void CheckExactList(string path, string[] actual, string name, List<string> failures)
{
    if (!File.Exists(path))
    {
        failures.Add($"Missing {name}: {path}");
        return;
    }

    var expected = File.ReadAllLines(path)
        .Where(line => line.Length != 0)
        .ToArray();
    if (!expected.SequenceEqual(expected.Order(StringComparer.Ordinal)))
        failures.Add($"The {name} is not sorted: {path}");
    if (expected.Distinct(StringComparer.Ordinal).Count() != expected.Length)
        failures.Add($"The {name} has duplicate entries: {path}");
    if (!expected.SequenceEqual(actual))
        failures.Add($"Framework public types differ from the approved {name}: {path}");
}

static void CheckExactText(string path, string actual, List<string> failures)
{
    if (!File.Exists(path))
    {
        failures.Add($"Missing public API snapshot: {path}");
        return;
    }

    if (!string.Equals(File.ReadAllText(path), actual, StringComparison.Ordinal))
        failures.Add($"Framework public API snapshot differs: {path}");
}

static void CheckGeneratedMembers(IEnumerable<Type> types, List<string> failures)
{
    var generated = types
        .SelectMany(type => type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)
            .Select(method => (Owner: TypeName(type), Name: method.Name)))
        .Where(entry => entry.Name.Contains('<', StringComparison.Ordinal) || entry.Name.Contains("lambda", StringComparison.OrdinalIgnoreCase))
        .Select(entry => $"{entry.Owner}.{entry.Name}")
        .Order(StringComparer.Ordinal)
        .ToArray();
    foreach (var name in generated)
        failures.Add($"Generated method is public: {name}");
}

static void CheckExampleTypes(string root, IEnumerable<string> publicTypes, List<string> failures)
{
    var expression = new Regex("^\\s*(?:public\\s+)?class\\s+([A-Za-z_][A-Za-z0-9_]*)", RegexOptions.Multiline);
    var examples = Directory.EnumerateFiles(Path.Combine(root, "examples"), "*.gs", SearchOption.AllDirectories)
        .SelectMany(path => expression.Matches(File.ReadAllText(path)).Select(match => "SharpTui." + match.Groups[1].Value))
        .ToHashSet(StringComparer.Ordinal);
    foreach (var type in publicTypes.Where(examples.Contains).Order(StringComparer.Ordinal))
        failures.Add($"Example type is public in the framework assembly: {type}");
}

static void CheckDocumentation(Type[] types, string[] documentationPaths, List<string> failures)
{
    var missingPaths = documentationPaths.Where(path => !File.Exists(path)).ToArray();
    foreach (var path in missingPaths)
        failures.Add($"Missing XML documentation: {path}");
    if (missingPaths.Length != 0)
        return;

    IReadOnlyDictionary<string, XElement> documentation;
    try
    {
        documentation = LoadDocumentation(documentationPaths);
    }
    catch (InvalidDataException exception)
    {
        failures.Add(exception.Message);
        return;
    }
    var flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;

    foreach (var type in types)
    {
        CheckSummary(documentation, $"T:{XmlOwnerName(type)}", $"type {TypeName(type)}", failures);

        if (type.IsEnum)
        {
            foreach (var field in type.GetFields(flags)
                .Where(field => !field.IsSpecialName && field.Name != "value__")
                .OrderBy(field => field.Name, StringComparer.Ordinal))
            {
                CheckSummary(documentation, $"F:{XmlOwnerName(type)}.{field.Name}",
                    $"enum value {TypeName(type)}.{field.Name}", failures);
            }
            continue;
        }

        foreach (var constructor in type.GetConstructors(flags).OrderBy(DescribeConstructor, StringComparer.Ordinal))
            CheckCallableDocumentation(documentation, constructor, $"constructor {TypeName(type)}.{GSharpConstructor(constructor)}", failures);

        foreach (var property in type.GetProperties(flags).OrderBy(property => property.Name, StringComparer.Ordinal))
            CheckSummary(documentation, $"P:{XmlOwnerName(type)}.{property.Name}",
                $"property {TypeName(type)}.{property.Name}", failures);

        foreach (var @event in type.GetEvents(flags).OrderBy(@event => @event.Name, StringComparer.Ordinal))
            CheckSummary(documentation, $"E:{XmlOwnerName(type)}.{@event.Name}",
                $"event {TypeName(type)}.{@event.Name}", failures);

        foreach (var method in type.GetMethods(flags)
            .Where(method => (!method.IsSpecialName || method.Name.StartsWith("op_", StringComparison.Ordinal))
                && !method.Name.StartsWith("get_", StringComparison.Ordinal)
                && !method.Name.StartsWith("set_", StringComparison.Ordinal)
                && !method.Name.StartsWith("add_", StringComparison.Ordinal)
                && !method.Name.StartsWith("remove_", StringComparison.Ordinal))
            .OrderBy(DescribeMethod, StringComparer.Ordinal))
        {
            CheckCallableDocumentation(documentation, method, $"method {TypeName(type)}.{GSharpMethod(method)}", failures);
        }
    }
}

static IReadOnlyDictionary<string, XElement> LoadDocumentation(IEnumerable<string> paths)
{
    var documentation = new Dictionary<string, XElement>(StringComparer.Ordinal);
    foreach (var path in paths)
    {
        if (!File.Exists(path))
            throw new FileNotFoundException("Build SharpTui.Framework and provide its supplemental XML documentation before generating API docs.", path);
        foreach (var member in XDocument.Load(path).Descendants("member").Where(member => member.Attribute("name") != null))
        {
            var id = member.Attribute("name")!.Value;
            if (!documentation.TryAdd(id, member))
                throw new InvalidDataException($"Duplicate XML documentation member: {id}");
        }
    }
    return documentation;
}

static void CheckSummary(IReadOnlyDictionary<string, XElement> documentation, string id, string label, List<string> failures)
{
    var summary = documentation.TryGetValue(id, out var entry) ? DocText(entry.Element("summary")) : "";
    if (summary.Length == 0)
        failures.Add($"Missing XML summary for {label}");
}

static void CheckCallableDocumentation(
    IReadOnlyDictionary<string, XElement> documentation,
    MethodBase callable,
    string label,
    List<string> failures)
{
    var entry = FindMethodDoc(documentation, callable);
    if (DocText(entry?.Element("summary")).Length == 0)
        failures.Add($"Missing XML summary for {label}");

    foreach (var parameter in callable.GetParameters())
    {
        var parameterDocumentation = entry?.Elements("param")
            .FirstOrDefault(element => element.Attribute("name")?.Value == parameter.Name);
        if (DocText(parameterDocumentation).Length == 0)
            failures.Add($"Missing XML parameter '{parameter.Name}' for {label}");
    }

    if (callable is MethodInfo method && method.ReturnType != typeof(void)
        && DocText(entry?.Element("returns")).Length == 0)
    {
        failures.Add($"Missing XML returns for {label}");
    }
}

static string DescribeType(Type type)
{
    var kind = type.IsEnum ? "enum" : type.IsValueType ? "struct" : type.IsInterface ? "interface" : "class";
    return $"type|{TypeName(type)}|{kind}";
}

static IEnumerable<string> DescribeSymbols(Type type)
{
    var flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
    var owner = TypeName(type);
    foreach (var constructor in type.GetConstructors(flags).OrderBy(DescribeConstructor, StringComparer.Ordinal))
        yield return $"ctor|{owner}|{DescribeParameters(constructor.GetParameters())}";
    foreach (var field in type.GetFields(flags).OrderBy(field => field.Name, StringComparer.Ordinal))
        yield return $"field|{owner}|{field.Name}|{TypeName(field.FieldType)}";
    foreach (var property in type.GetProperties(flags).OrderBy(property => property.Name, StringComparer.Ordinal))
        yield return $"property|{owner}|{property.Name}|{TypeName(property.PropertyType)}|{DescribeParameters(property.GetIndexParameters())}";
    foreach (var @event in type.GetEvents(flags).OrderBy(@event => @event.Name, StringComparer.Ordinal))
        yield return $"event|{owner}|{@event.Name}|{TypeName(@event.EventHandlerType!)}";
    foreach (var method in type.GetMethods(flags).OrderBy(DescribeMethod, StringComparer.Ordinal))
        yield return $"method|{owner}|{method.Name}|{TypeName(method.ReturnType)}|generic:{method.GetGenericArguments().Length}|{DescribeParameters(method.GetParameters())}";
}

static string DescribeConstructor(ConstructorInfo constructor) => DescribeParameters(constructor.GetParameters());

static string DescribeMethod(MethodInfo method) => $"{method.Name}|{TypeName(method.ReturnType)}|{method.GetGenericArguments().Length}|{DescribeParameters(method.GetParameters())}";

static string DescribeParameters(IEnumerable<ParameterInfo> parameters) => string.Join(",", parameters.Select(parameter => $"{parameter.Name}:{TypeName(parameter.ParameterType)}"));

static string TypeName(Type type) => type.FullName ?? type.Name;

static string RenderMarkdown(Type[] types, IReadOnlyDictionary<string, XElement> documentation, string symbolHash)
{
    var output = new StringBuilder();
    output.AppendLine("# SharpTUI public API");
    output.AppendLine();
    output.AppendLine("Generated from `SharpTui.Framework.dll` plus compiler-emitted and supplemental XML documentation by the API-surface tool.");
    output.AppendLine($"Public-symbol SHA-256: `{symbolHash}`.");
    output.AppendLine();
    output.AppendLine("Inherited members are documented on their declaring type. Types and members absent from this document are not part of the exported API.");
    output.AppendLine();
    output.AppendLine("## Types");
    output.AppendLine();
    foreach (var type in types)
        output.AppendLine($"- [{TypeName(type)}](#{Anchor(TypeName(type))})");

    foreach (var type in types)
    {
        output.AppendLine();
        output.AppendLine($"## {TypeName(type)}");
        output.AppendLine();
        AppendSummary(output, FindDoc(documentation, $"T:{XmlOwnerName(type)}"));
        output.AppendLine($"G# kind: `{TypeKind(type)}`.");
        if (type.BaseType != null && type.BaseType != typeof(object) && type.BaseType != typeof(ValueType) && type.BaseType != typeof(Enum))
            output.AppendLine($"Inherits `{GSharpTypeName(type.BaseType)}`; see that type for inherited members.");
        var publicInterfaces = type.GetInterfaces()
            .Where(candidate => candidate.IsPublic && candidate.Namespace == "SharpTui")
            .OrderBy(TypeName, StringComparer.Ordinal)
            .ToArray();
        if (publicInterfaces.Length != 0)
            output.AppendLine($"Implements {string.Join(", ", publicInterfaces.Select(candidate => $"`{GSharpTypeName(candidate)}`"))}.");

        var flags = BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly;
        if (type.IsEnum)
        {
            var fields = type.GetFields(flags)
                .Where(field => !field.IsSpecialName && field.Name != "value__")
                .OrderBy(field => Convert.ToInt64(field.GetRawConstantValue()), Comparer<long>.Default)
                .ThenBy(field => field.Name, StringComparer.Ordinal)
                .ToArray();
            AppendSection(output, "Values", fields, field => field.Name,
                field => FindDoc(documentation, $"F:{XmlOwnerName(type)}.{field.Name}"));
            continue;
        }

        var constructors = type.GetConstructors(flags).OrderBy(DescribeConstructor, StringComparer.Ordinal).ToArray();
        AppendSection(output, "Constructors", constructors, GSharpConstructor,
            constructor => FindMethodDoc(documentation, constructor));

        var properties = type.GetProperties(flags).OrderBy(property => property.Name, StringComparer.Ordinal).ToArray();
        AppendSection(output, "Properties", properties, GSharpProperty,
            property => FindDoc(documentation, $"P:{XmlOwnerName(type)}.{property.Name}"));

        var methods = type.GetMethods(flags)
            .Where(method => (!method.IsSpecialName || method.Name.StartsWith("op_", StringComparison.Ordinal))
                && !method.Name.StartsWith("get_", StringComparison.Ordinal)
                && !method.Name.StartsWith("set_", StringComparison.Ordinal)
                && !method.Name.StartsWith("add_", StringComparison.Ordinal)
                && !method.Name.StartsWith("remove_", StringComparison.Ordinal))
            .OrderBy(DescribeMethod, StringComparer.Ordinal)
            .ToArray();
        AppendSection(output, "Methods", methods, GSharpMethod,
            method => FindMethodDoc(documentation, method));
    }

    return output.ToString();
}

static void AppendSection<T>(StringBuilder output, string heading, T[] members, Func<T, string> signature, Func<T, XElement?> documentation)
{
    if (members.Length == 0)
        return;
    output.AppendLine();
    output.AppendLine($"### {heading}");
    output.AppendLine();
    foreach (var member in members)
    {
        output.Append($"- `{signature(member)}`");
        var doc = documentation(member);
        var summary = DocText(doc?.Element("summary"));
        if (summary.Length != 0)
            output.Append($" — {summary}");
        output.AppendLine();
        if (doc == null)
            continue;
        foreach (var parameter in doc.Elements("param"))
        {
            var name = parameter.Attribute("name")?.Value ?? "parameter";
            var text = DocText(parameter);
            if (text.Length != 0)
                output.AppendLine($"  - `{name}`: {text}");
        }
        var returns = DocText(doc.Element("returns"));
        if (returns.Length != 0)
            output.AppendLine($"  - Returns: {returns}");
    }
}

static XElement? FindDoc(IReadOnlyDictionary<string, XElement> documentation, string id) =>
    documentation.TryGetValue(id, out var entry) ? entry : null;

static XElement? FindMethodDoc(IReadOnlyDictionary<string, XElement> documentation, MethodBase method)
{
    var exact = XmlDocId(method);
    if (documentation.TryGetValue(exact, out var entry))
        return entry;

    var owner = XmlOwnerName(method.DeclaringType!);
    var name = method is ConstructorInfo
        ? "#ctor"
        : method.Name + (method.IsGenericMethod ? $"``{method.GetGenericArguments().Length}" : "");
    var prefix = $"M:{owner}.{name}";
    var expected = method.GetParameters().Select(parameter => SimpleXmlTypeName(XmlTypeName(parameter.ParameterType))).ToArray();
    var candidates = documentation
        .Where(pair => pair.Key == prefix || pair.Key.StartsWith(prefix + "(", StringComparison.Ordinal))
        .Where(pair => XmlParameterTypes(pair.Key).SequenceEqual(expected, StringComparer.Ordinal))
        .Select(pair => pair.Value)
        .ToArray();
    return candidates.Length == 1 ? candidates[0] : null;
}

static IEnumerable<string> XmlParameterTypes(string id)
{
    var open = id.IndexOf('(');
    if (open < 0)
        return [];
    var body = id[(open + 1)..^1];
    var result = new List<string>();
    var start = 0;
    var depth = 0;
    for (var i = 0; i < body.Length; i++)
    {
        if (body[i] == '{' || body[i] == '[')
            depth++;
        else if (body[i] == '}' || body[i] == ']')
            depth--;
        else if (body[i] == ',' && depth == 0)
        {
            result.Add(SimpleXmlTypeName(body[start..i]));
            start = i + 1;
        }
    }
    if (body.Length != 0)
        result.Add(SimpleXmlTypeName(body[start..]));
    return result;
}

static string SimpleXmlTypeName(string value) => Regex.Replace(value, @"(?:[A-Za-z_][A-Za-z0-9_]*\.)+", "");

static void AppendSummary(StringBuilder output, XElement? documentation)
{
    var summary = DocText(documentation?.Element("summary"));
    if (summary.Length != 0)
    {
        output.AppendLine(summary);
        output.AppendLine();
    }
}

static string DocText(XElement? element)
{
    if (element == null)
        return "";
    return Regex.Replace(element.Value, "\\s+", " ").Trim();
}

static string TypeKind(Type type) => type.IsEnum ? "enum" : type.IsValueType ? "struct" : type.IsInterface ? "interface" : "class";

static string GSharpConstructor(ConstructorInfo constructor) => $"init({GSharpParameters(constructor.GetParameters())})";

static string GSharpProperty(PropertyInfo property)
{
    var accessor = property.GetMethod ?? property.SetMethod;
    var shared = accessor?.IsStatic == true ? "shared " : "";
    var access = new List<string>();
    if (property.GetMethod?.IsPublic == true)
        access.Add("get");
    if (property.SetMethod?.IsPublic == true)
        access.Add(IsInitOnly(property) ? "init" : "set");
    return $"{shared}prop {property.Name} {GSharpTypeName(property.PropertyType)} {{ {string.Join("; ", access)}; }}";
}

static bool IsInitOnly(PropertyInfo property) => property.SetMethod?.ReturnParameter
    .GetRequiredCustomModifiers()
    .Contains(typeof(IsExternalInit)) == true;

static string GSharpMethod(MethodInfo method)
{
    if (method.Name is "op_Equality" or "op_Inequality" && method.GetParameters().Length == 2)
    {
        var parameters = method.GetParameters();
        var token = method.Name == "op_Equality" ? "==" : "!=";
        return $"func ({parameters[0].Name} {GSharpTypeName(parameters[0].ParameterType)}) operator {token}({parameters[1].Name} {GSharpTypeName(parameters[1].ParameterType)}) {GSharpTypeName(method.ReturnType)}";
    }
    var shared = method.IsStatic ? "shared " : "";
    var result = method.ReturnType == typeof(void) ? "" : $" {GSharpTypeName(method.ReturnType)}";
    return $"{shared}func {method.Name}({GSharpParameters(method.GetParameters())}){result}";
}

static string GSharpParameters(IEnumerable<ParameterInfo> parameters) => string.Join(", ", parameters.Select(parameter =>
{
    var prefix = parameter.IsOut ? "out " : parameter.ParameterType.IsByRef ? "ref " : "";
    var type = parameter.ParameterType.IsByRef ? parameter.ParameterType.GetElementType()! : parameter.ParameterType;
    return $"{prefix}{parameter.Name} {GSharpTypeName(type)}";
}));

static string GSharpTypeName(Type type)
{
    if (type.IsByRef)
        return GSharpTypeName(type.GetElementType()!);
    if (type.IsArray)
        return $"[]{GSharpTypeName(type.GetElementType()!)}";
    if (Nullable.GetUnderlyingType(type) is Type nullable)
        return $"{GSharpTypeName(nullable)}?";
    var primitive = type.FullName switch
    {
        "System.Void" => "void",
        "System.Boolean" => "bool",
        "System.Char" => "char",
        "System.String" => "string",
        "System.SByte" => "int8",
        "System.Byte" => "uint8",
        "System.Int16" => "int16",
        "System.UInt16" => "uint16",
        "System.Int32" => "int32",
        "System.UInt32" => "uint32",
        "System.Int64" => "int64",
        "System.UInt64" => "uint64",
        "System.Single" => "float32",
        "System.Double" => "float64",
        _ => null,
    };
    if (primitive != null)
        return primitive;
    if (type.IsGenericParameter)
        return type.Name;
    if (type.IsGenericType)
    {
        var name = type.GetGenericTypeDefinition().Name;
        var tick = name.IndexOf('`');
        if (tick >= 0)
            name = name[..tick];
        return $"{name}[{string.Join(", ", type.GetGenericArguments().Select(GSharpTypeName))}]";
    }
    return type.Name.Replace('+', '.');
}

static string XmlDocId(MethodBase method)
{
    var owner = XmlOwnerName(method.DeclaringType!);
    var name = method is ConstructorInfo
        ? "#ctor"
        : method.Name + (method.IsGenericMethod ? $"``{method.GetGenericArguments().Length}" : "");
    var parameters = method.GetParameters();
    var suffix = parameters.Length == 0 ? "" : $"({string.Join(",", parameters.Select(parameter => XmlTypeName(parameter.ParameterType)))})";
    return $"M:{owner}.{name}{suffix}";
}

static string XmlOwnerName(Type type) => (type.FullName ?? type.Name).Replace('+', '.');

static string XmlTypeName(Type type)
{
    if (type.IsByRef)
        return XmlTypeName(type.GetElementType()!) + "@";
    if (type.IsPointer)
        return XmlTypeName(type.GetElementType()!) + "*";
    if (type.IsArray)
        return XmlTypeName(type.GetElementType()!) + "[]";
    if (type.IsGenericParameter)
        return type.DeclaringMethod != null ? $"``{type.GenericParameterPosition}" : $"`{type.GenericParameterPosition}";
    if (type.IsGenericType)
    {
        var definition = type.GetGenericTypeDefinition();
        var name = XmlOwnerName(definition);
        var tick = name.IndexOf('`');
        if (tick >= 0)
            name = name[..tick];
        return $"{name}{{{string.Join(",", type.GetGenericArguments().Select(XmlTypeName))}}}";
    }
    return XmlOwnerName(type);
}

static string Anchor(string value) => Regex.Replace(value.ToLowerInvariant().Replace(" ", "-"), "[^a-z0-9-]", "");

static bool IsCompilerContainer(Type type) => type.Name is "<Program>";

static IEnumerable<string> FrameworkInputs(string root)
{
    yield return Path.Combine(root, "SharpTui.Framework.gsproj");
    foreach (var path in Directory.EnumerateFiles(Path.Combine(root, "src"), "*.gs", SearchOption.AllDirectories))
    {
        var relative = Path.GetRelativePath(root, path).Replace('\\', '/');
        if (relative is "src/Main.gs")
            continue;
        if (!relative.StartsWith("src/Checks/", StringComparison.Ordinal))
            yield return path;
    }
}

static string FindRoot()
{
    for (var directory = new DirectoryInfo(Environment.CurrentDirectory); directory != null; directory = directory.Parent)
    {
        if (File.Exists(Path.Combine(directory.FullName, "SharpTui.Framework.gsproj")))
            return directory.FullName;
    }
    throw new DirectoryNotFoundException("Could not find the SharpTUI repository root.");
}
