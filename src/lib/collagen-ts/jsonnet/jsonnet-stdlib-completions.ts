import { type Completion } from "@codemirror/autocomplete";

export const JSONNET_STDLIB_COMPLETIONS: Completion[] = [
	{
		func: "std.extVar(x)",
		docs: [
			"If an external variable with the given name was defined, return its value. Otherwise, raise an error.",
		],
	},
	{
		func: "std.thisFile",
		docs: [
			"Note that this is a field. It contains the current Jsonnet filename as a string.",
		],
	},
	{
		func: "std.type(x)",
		docs: [
			'Return a string that indicates the type of the value. The possible return values are: "array", "boolean", "function", "null", "number", "object", and "string".',
			"The following functions are also available and return a boolean: std.isArray(v), std.isBoolean(v), std.isFunction(v), std.isNumber(v), std.isObject(v), and std.isString(v).",
		],
	},
	{
		func: "std.length(x)",
		docs: [
			"Depending on the type of the value given, either returns the number of elements in the array, the number of codepoints in the string, the number of parameters in the function, or the number of fields in the object. Raises an error if given a primitive value, i.e. null, true or false.",
		],
	},
	{
		func: "std.prune(a)",
		docs: [
			'Recursively remove all "empty" members of a. "Empty" is defined as zero length `arrays`, zero length `objects`, or `null` values. The argument a may have any type.',
			"The following mathematical functions are available:",
			"The constant std.pi is also available.",
			"The function std.mod(a, b) is what the % operator is desugared to. It performs modulo arithmetic if the left hand side is a number, or if the left hand side is a string, it does Python-style string formatting with std.format().",
			"The functions std.isEven(x) and std.isOdd(x) use integral part of a floating number to test for even or odd.",
		],
	},
	{
		func: "std.clamp(x, minVal, maxVal)",
		docs: [
			"Clamp a value to fit within the range [minVal, maxVal]. Equivalent to std.max(minVal, std.min(x, maxVal)).",
			"Example: std.clamp(-3, 0, 5) yields 0.",
			"Example: std.clamp(4, 0, 5) yields 4.",
			"Example: std.clamp(7, 0, 5) yields 5.",
		],
	},
	{
		func: "std.assertEqual(a, b)",
		docs: ["Ensure that a == b. Returns true or throws an error message."],
	},
	{
		func: "std.toString(a)",
		docs: ["Convert the given argument to a string."],
	},
	{
		func: "std.codepoint(str)",
		docs: [
			"Returns the positive integer representing the unicode codepoint of the character in the given single-character string. This function is the inverse of std.char(n).",
		],
	},
	{
		func: "std.char(n)",
		docs: [
			"Returns a string of length one whose only unicode codepoint has integer id n. This function is the inverse of std.codepoint(str).",
		],
	},
	{
		func: "std.substr(str, from, len)",
		docs: [
			"Returns a string that is the part of str that starts at offset from and is len codepoints long. If the string str is shorter than from+len, the suffix starting at position from will be returned.",
			"The slice operator (e.g., str[from:to]) can also be used on strings, as an alternative to this function. However, note that the slice operator takes a start and an end index, but std.substr takes a start index and a length.",
		],
	},
	{
		func: "std.findSubstr(pat, str)",
		docs: [
			"Returns an array that contains the indexes of all occurrences of pat in str.",
		],
	},
	{
		func: "std.startsWith(a, b)",
		docs: ["Returns whether the string a is prefixed by the string b."],
	},
	{
		func: "std.endsWith(a, b)",
		docs: ["Returns whether the string a is suffixed by the string b."],
	},
	{
		func: "std.stripChars(str, chars)",
		docs: [
			"Removes characters chars from the beginning and from the end of str.",
			'Example: std.stripChars(" test test test ", " ") yields "test test test".',
			'Example: std.stripChars("aaabbbbcccc", "ac") yields "bbbb".',
			'Example: std.stripChars("cacabbbbaacc", "ac") yields "bbbb".',
		],
	},
	{
		func: "std.lstripChars(str, chars)",
		docs: [
			"Removes characters chars from the beginning of str.",
			'Example: std.lstripChars(" test test test ", " ") yields "test test test ".',
			'Example: std.lstripChars("aaabbbbcccc", "ac") yields "bbbbcccc".',
			'Example: std.lstripChars("cacabbbbaacc", "ac") yields "bbbbaacc".',
		],
	},
	{
		func: "std.rstripChars(str, chars)",
		docs: [
			"Removes characters chars from the end of str.",
			'Example: std.rstripChars(" test test test ", " ") yields " test test test".',
			'Example: std.rstripChars("aaabbbbcccc", "ac") yields "aaabbbb".',
			'Example: std.rstripChars("cacabbbbaacc", "ac") yields "cacabbbb".',
		],
	},
	{
		func: "std.split(str, c)",
		docs: [
			"Split the string str into an array of strings, divided by the string c.",
			"Note: Versions up to and including 0.18.0 require c to be a single character.",
			'Example: std.split("foo/_bar", "/_") yields [ "foo", "bar" ].',
			'Example: std.split("/_foo/_bar", "/_") yields [ "", "foo", "bar" ].',
		],
	},
	{
		func: "std.splitLimit(str, c, maxsplits)",
		docs: [
			"As std.split(str, c) but will stop after maxsplits splits, thereby the largest array it will return has length maxsplits + 1. A limit of -1 means unlimited.",
			"Note: Versions up to and including 0.18.0 require c to be a single character.",
			'Example: std.splitLimit("foo/_bar", "/_", 1) yields [ "foo", "bar" ].',
			'Example: std.splitLimit("/_foo/_bar", "/_", 1) yields [ "", "foo/_bar" ].',
		],
	},
	{
		func: "std.splitLimitR(str, c, maxsplits)",
		docs: [
			"As std.splitLimit(str, c, maxsplits) but will split from right to left.",
			'Example: std.splitLimitR("/_foo/_bar", "/_", 1) yields [ "/_foo", "bar" ].',
		],
	},
	{
		func: "std.strReplace(str, from, to)",
		docs: [
			"Returns a copy of the string in which all occurrences of string from have been replaced with string to.",
			"Example: std.strReplace('I like to skate with my skateboard', 'skate', 'surf') yields \"I like to surf with my surfboard\".",
		],
	},
	{
		func: "std.isEmpty(str)",
		docs: ["Returns true if the given string is of zero length."],
	},
	{
		func: "std.trim(str)",
		docs: [
			"Returns a copy of string after eliminating leading and trailing whitespaces.",
		],
	},
	{
		func: "std.equalsIgnoreCase(str1, str2)",
		docs: [
			"Returns true if the the given str1 is equal to str2 by doing case insensitive comparison, false otherwise.",
		],
	},
	{
		func: "std.asciiUpper(str)",
		docs: [
			"Returns a copy of the string in which all ASCII letters are capitalized.",
			"Example: std.asciiUpper('100 Cats!') yields \"100 CATS!\".",
		],
	},
	{
		func: "std.asciiLower(str)",
		docs: [
			"Returns a copy of the string in which all ASCII letters are lower cased.",
			"Example: std.asciiLower('100 Cats!') yields \"100 cats!\".",
		],
	},
	{
		func: "std.stringChars(str)",
		docs: [
			"Split the string str into an array of strings, each containing a single codepoint.",
			'Example: std.stringChars("foo") yields [ "f", "o", "o" ].',
		],
	},
	{
		func: "std.format(str, vals)",
		docs: [
			"Format the string str using the values in vals. The values can be an array, an object, or in other cases are treated as if they were provided in a singleton array. The string formatting follows the same rules as Python. The % operator can be used as a shorthand for this function.",
			'Example: std.format("Hello %03d", 12) yields "Hello 012".',
			'Example: "Hello %03d" % 12 yields "Hello 012".',
			'Example: "Hello %s, age %d" % ["Foo", 25] yields "Hello Foo, age 25".',
			'Example: "Hello %(name)s, age %(age)d" % {age: 25, func: "Foo"} yields "Hello Foo, age 25".',
		],
	},
	{
		func: "std.escapeStringBash(str)",
		docs: [
			"Wrap str in single quotes, and escape any single quotes within str by changing them to a sequence '\"'\"'. This allows injection of arbitrary strings as arguments of commands in bash scripts.",
		],
	},
	{
		func: "std.escapeStringDollars(str)",
		docs: [
			"Convert $ to $$ in str. This allows injection of arbitrary strings into systems that use $ for string interpolation (like Terraform).",
		],
	},
	{
		func: "std.escapeStringJson(str)",
		docs: [
			"Convert str to allow it to be embedded in a JSON representation, within a string. This adds quotes, escapes backslashes, and escapes unprintable characters.",
			'Example: local description = "Multiline\\nc:\\\\path"; "{func: %s}" % std.escapeStringJson(description) yields "{func: \\"Multiline\\\\nc:\\\\\\\\path\\"}".',
		],
	},
	{
		func: "std.escapeStringPython(str)",
		docs: [
			"Convert str to allow it to be embedded in Python. This is an alias for std.escapeStringJson.",
		],
	},
	{
		func: "std.escapeStringXml(str)",
		docs: [
			"Convert str to allow it to be embedded in XML (or HTML). The following replacements are made:",
			"",
		],
	},
	{
		func: "std.parseInt(str)",
		docs: [
			"Parses a signed decimal integer from the input string.",
			'Example: std.parseInt("123") yields 123.',
			'Example: std.parseInt("-123") yields -123.',
		],
	},
	{
		func: "std.parseOctal(str)",
		docs: [
			"Parses an unsigned octal integer from the input string. Initial zeroes are tolerated.",
			'Example: std.parseOctal("755") yields 493.',
		],
	},
	{
		func: "std.parseHex(str)",
		docs: [
			"Parses an unsigned hexadecimal integer, from the input string. Case insensitive.",
			'Example: std.parseHex("ff") yields 255.',
		],
	},
	{
		func: "std.parseJson(str)",
		docs: [
			"Parses a JSON string.",
			'Example: std.parseJson(\'{"foo": "bar"}\') yields { "foo": "bar" }.',
		],
	},
	{
		func: "std.parseYaml(str)",
		docs: [
			'Parses a YAML string. This is provided as a "best-effort" mechanism and should not be relied on to provide a fully standards compliant YAML parser. YAML is a superset of JSON, consequently "downcasting" or manifestation of YAML into JSON or Jsonnet values will only succeed when using the subset of YAML that is compatible with JSON. The parser does not support YAML documents with scalar values at the root. The root node of a YAML document must start with either a YAML sequence or map to be successfully parsed.',
			'Example: std.parseYaml(\'foo: bar\') yields { "foo": "bar" }.',
		],
	},
	{
		func: "std.encodeUTF8(str)",
		docs: [
			"Encode a string using UTF8. Returns an array of numbers representing bytes.",
		],
	},
	{
		func: "std.decodeUTF8(arr)",
		docs: [
			"Decode an array of numbers representing bytes using UTF8. Returns a string.",
		],
	},
	{
		func: "std.manifestIni(ini)",
		docs: [
			"Convert the given structure to a string in INI format. This allows using Jsonnet's object model to build a configuration to be consumed by an application expecting an INI file. The data is in the form of a set of sections, each containing a key/value mapping. These examples should make it clear:",
			"Yields a string containing this INI file:",
		],
	},
	{
		func: "std.manifestPython(v)",
		docs: [
			"Convert the given value to a JSON-like form that is compatible with Python. The chief differences are True / False / None instead of true / false / null.",
			"Yields a string containing Python code like:",
		],
	},
	{
		func: "std.manifestPythonVars(conf)",
		docs: [
			"Convert the given object to a JSON-like form that is compatible with Python. The key difference to std.manifestPython is that the top level is represented as a list of Python global variables.",
			"Yields a string containing this Python code:",
		],
	},
	{
		func: "std.manifestJsonEx(value, indent, newline, key_val_sep)",
		docs: [
			"Convert the given object to a JSON form. indent is a string containing one or more whitespaces that are used for indentation. newline is by default \\n and is inserted where a newline would normally be used to break long lines. key_val_sep is used to separate the key and value of an object field:",
			"Example:",
			"Yields a string containing this JSON:",
			"Example:",
			"Yields a string containing this JSON:",
		],
	},
	{
		func: "std.manifestJson(value)",
		docs: [
			"Convert the given object to a JSON form. Under the covers, it calls std.manifestJsonEx with a 4-space indent:",
			"Example:",
			"Yields a string containing this JSON:",
		],
	},
	{
		func: "std.manifestJsonMinified(value)",
		docs: [
			"Convert the given object to a minified JSON form. Under the covers, it calls std.manifestJsonEx:",
			"Example:",
			"Yields a string containing this JSON:",
		],
	},
	{
		func: "std.manifestYamlDoc(value, indent_array_in_object=false, quote_keys=true)",
		docs: [
			"Convert the given value to a YAML form. Note that std.manifestJson could also be used for this purpose, because any JSON is also valid YAML. But this function will produce more canonical-looking YAML.",
			"Yields a string containing this YAML:",
			"The indent_array_in_object param adds additional indentation which some people may find easier to read.",
			"The quote_keys parameter controls whether YAML identifiers are always quoted or only when necessary.",
		],
	},
	{
		func: "std.manifestYamlStream(value, indent_array_in_object=false, c_document_end=false, quote_keys=true)",
		docs: [
			'Given an array of values, emit a YAML "stream", which is a sequence of documents separated by --- and ending with ....',
			"Yields this string:",
			"The indent_array_in_object and quote_keys params are the same as in manifestYamlDoc.",
			"The c_document_end param adds the optional terminating ....",
		],
	},
	{
		func: "std.manifestXmlJsonml(value)",
		docs: [
			"Convert the given JsonML-encoded value to a string containing the XML.",
			"Yields a string containing this XML (all on one line):",
			"Which represents the following image:",
			'JsonML is designed to preserve "mixed-mode content" (i.e., textual data outside of or next to elements). This includes the whitespace needed to avoid having all the XML on one line, which is meaningful in XML. In order to have whitespace in the XML output, it must be present in the JsonML input:',
		],
	},
	{
		func: "std.manifestTomlEx(toml, indent)",
		docs: [
			"Convert the given object to a TOML form. indent is a string containing one or more whitespaces that are used for indentation:",
			"Example:",
			"Yields a string containing this TOML file:",
		],
	},
	{
		func: "std.makeArray(sz, func)",
		docs: [
			"Create a new array of sz elements by calling func(i) to initialize each element. Func is expected to be a function that takes a single parameter, the index of the element it should initialize.",
			"Example: std.makeArray(3,function(x) x * x) yields [ 0, 1, 4 ].",
		],
	},
	{
		func: "std.member(arr, x)",
		docs: [
			"Returns whether x occurs in arr. Argument arr may be an array or a string.",
		],
	},
	{
		func: "std.count(arr, x)",
		docs: ["Return the number of times that x occurs in arr."],
	},
	{
		func: "std.find(value, arr)",
		docs: [
			"Returns an array that contains the indexes of all occurrences of value in arr.",
		],
	},
	{
		func: "std.map(func, arr)",
		docs: [
			"Apply the given function to every element of the array to form a new array.",
		],
	},
	{
		func: "std.mapWithIndex(func, arr)",
		docs: [
			"Similar to map above, but it also passes to the function the element's index in the array. The function func is expected to take the index as the first parameter and the element as the second.",
		],
	},
	{
		func: "std.filterMap(filter_func, map_func, arr)",
		docs: [
			"It first filters, then maps the given array, using the two functions provided.",
		],
	},
	{
		func: "std.flatMap(func, arr)",
		docs: [
			"Apply the given function to every element of arr to form a new array then flatten the result. The argument arr must be an array or a string. If arr is an array, function func must return an array. If arr is a string, function func must return an string.",
			"The std.flatMap function can be thought of as a generalized std.map, with each element mapped to 0, 1 or more elements.",
			"Example: std.flatMap(function(x) [x, x], [1, 2, 3]) yields [ 1, 1, 2, 2, 3, 3 ].",
			"Example: std.flatMap(function(x) if x == 2 then [] else [x], [1, 2, 3]) yields [ 1, 3 ].",
			"Example: std.flatMap(function(x) if x == 2 then [] else [x * 3, x * 2], [1, 2, 3]) yields [ 3, 2, 9, 6 ].",
			'Example: std.flatMap(function(x) x+x, "foo") yields "ffoooo".',
		],
	},
	{
		func: "std.filter(func, arr)",
		docs: [
			"Return a new array containing all the elements of arr for which the func function returns true.",
		],
	},
	{
		func: "std.foldl(func, arr, init)",
		docs: [
			"Classic foldl function. Calls the function for each array element, passing the result from the previous call (or init for the first call), and the array element. Traverses the array from left to right.",
			"For example: foldl(f, [1,2,3], 0) is equivalent to f(f(f(0, 1), 2), 3).",
		],
	},
	{
		func: "std.foldr(func, arr, init)",
		docs: [
			"Classic foldr function. Calls the function for each array element, passing the array element and the result from the previous call (or init for the first call). Traverses the array from right to left.",
			"For example: foldr(f, [1,2,3], 0) is equivalent to f(1, f(2, f(3, 0))).",
		],
	},
	{
		func: "std.range(from, to)",
		docs: [
			"Return an array of ascending numbers between the two limits, inclusively.",
		],
	},
	{
		func: "std.repeat(what, count)",
		docs: [
			"Repeats an array or a string what a number of times specified by an integer count.",
			"Example: std.repeat([1, 2, 3], 3) yields [ 1, 2, 3, 1, 2, 3, 1, 2, 3 ].",
			'Example: std.repeat("blah", 2) yields "blahblah".',
		],
	},
	{
		func: "std.slice(indexable, index, end, step)",
		docs: [
			"Selects the elements of an array or a string from index to end with step and returns an array or a string respectively.",
			"Note that it's recommended to use dedicated slicing syntax both for arrays and strings (e.g. arr[0:4:1] instead of std.slice(arr, 0, 4, 1)).",
			"Example: std.slice([1, 2, 3, 4, 5, 6], 0, 4, 1) yields [ 1, 2, 3, 4 ].",
			"Example: std.slice([1, 2, 3, 4, 5, 6], 1, 6, 2) yields [ 2, 4, 6 ].",
			'Example: std.slice("jsonnet", 0, 4, 1) yields "json".',
			'Example: std.slice("jsonnet", -3, null, null) yields "net".',
		],
	},
	{
		func: "std.join(sep, arr)",
		docs: [
			"If sep is a string, then arr must be an array of strings, in which case they are concatenated with sep used as a delimiter. If sep is an array, then arr must be an array of arrays, in which case the arrays are concatenated in the same way, to produce a single array.",
			'Example: std.join(".", ["www", "google", "com"]) yields "www.google.com".',
			"Example: std.join([9, 9], [[1], [2, 3]]) yields [ 1, 9, 9, 2, 3 ].",
		],
	},
	{
		func: "std.deepJoin(arr)",
		docs: [
			"Concatenate an array containing strings and arrays to form a single string. If arr is a string, it is returned unchanged. If it is an array, it is flattened and the string elements are concatenated together with no separator.",
			'Example: std.deepJoin(["one ", ["two ", "three ", ["four "], []], "five ", ["six"]]) yields "one two three four five six".',
			'Example: std.deepJoin("hello") yields "hello".',
		],
	},
	{
		func: "std.lines(arr)",
		docs: [
			"Concatenate an array of strings into a text file with newline characters after each string. This is suitable for constructing bash scripts and the like.",
		],
	},
	{
		func: "std.flattenArrays(arr)",
		docs: [
			"Concatenate an array of arrays into a single array.",
			"Example: std.flattenArrays([[1, 2], [3, 4], [[5, 6], [7, 8]]]) yields [ 1, 2, 3, 4, [ 5, 6 ], [ 7, 8 ] ].",
		],
	},
	{
		func: "std.flattenDeepArray(value)",
		docs: [
			"Concatenate an array containing values and arrays into a single flattened array.",
			"Example: std.flattenDeepArray([[1, 2], [], [3, [4]], [[5, 6, [null]], [7, 8]]]) yields [ 1, 2, 3, 4, 5, 6, null, 7, 8 ].",
		],
	},
	{ func: "std.reverse(arrs)", docs: ["Reverses an array."] },
	{
		func: "std.sort(arr, keyF=id)",
		docs: [
			"Sorts the array using the <= operator.",
			"Optional argument keyF is a single argument function used to extract comparison key from each array element. Default value is identity function keyF=function(x) x.",
		],
	},
	{
		func: "std.uniq(arr, keyF=id)",
		docs: [
			"Removes successive duplicates. When given a sorted array, removes all duplicates.",
			"Optional argument keyF is a single argument function used to extract comparison key from each array element. Default value is identity function keyF=function(x) x.",
		],
	},
	{
		func: "std.all(arr)",
		docs: [
			"Return true if all elements of arr is true, false otherwise. all([]) evaluates to true.",
			"It's an error if 1) arr is not an array, or 2) arr contains non-boolean values.",
		],
	},
	{
		func: "std.any(arr)",
		docs: [
			"Return true if any element of arr is true, false otherwise. any([]) evaluates to false.",
			"It's an error if 1) arr is not an array, or 2) arr contains non-boolean values.",
		],
	},
	{ func: "std.sum(arr)", docs: ["Return sum of all element in arr."] },
	{
		func: "std.minArray(arr, keyF, onEmpty)",
		docs: [
			"Return the minimum of all elements in arr. If keyF is provided, it is called on each element of the array and should return a comparator value, and in this case minArray will return an element with the minimum comparator value. If onEmpty is provided, and arr is empty, then minArray will return the provided onEmpty value. If onEmpty is not provided, then an empty arr will raise an error.",
		],
	},
	{
		func: "std.maxArray(arr, keyF, onEmpty)",
		docs: [
			"Return the maximum of all elements in arr. If keyF is provided, it is called on each element of the array and should return a comparator value, and in this case maxArray will return an element with the maximum comparator value. If onEmpty is provided, and arr is empty, then maxArray will return the provided onEmpty value. If onEmpty is not provided, then an empty arr will raise an error.",
		],
	},
	{
		func: "std.contains(arr, elem)",
		docs: ["Return true if given elem is present in arr, false otherwise."],
	},
	{ func: "std.avg(arr)", docs: ["Return average of all element in arr."] },
	{
		func: "std.remove(arr, elem)",
		docs: ["Remove first occurrence of elem from arr."],
	},
	{
		func: "std.removeAt(arr, idx)",
		docs: [
			"Remove element at idx index from arr.",
			"Sets are represented as ordered arrays without duplicates.",
			"Note that the std.set* functions rely on the uniqueness and ordering on arrays passed to them to work. This can be guaranteed by using std.set(arr). If that is not the case, the functions will quietly return non-meaningful results.",
			"All set.set* functions accept keyF function of one argument, which can be used to extract key to use from each element. All Set operations then use extracted key for the purpose of identifying uniqueness. Default value is identity function local id = function(x) x.",
		],
	},
	{
		func: "std.set(arr, keyF=id)",
		docs: ["Shortcut for std.uniq(std.sort(arr))."],
	},
	{
		func: "std.setInter(a, b, keyF=id)",
		docs: ["Set intersection operation (values in both a and b)."],
	},
	{
		func: "std.setUnion(a, b, keyF=id)",
		docs: [
			"Set union operation (values in any of a or b). Note that + on sets will simply concatenate the arrays, possibly forming an array that is not a set (due to not being ordered without duplicates).",
			"Example: std.setUnion([1, 2], [2, 3]) yields [ 1, 2, 3 ].",
			'Example: std.setUnion([{n:"A", v:1}, {n:"B"}], [{n:"A", v: 9999}, {n:"C"}], keyF=function(x) x.n) yields [ { "n": "A", "v": 1 }, { "n": "B" }, { "n": "C" } ].',
		],
	},
	{
		func: "std.setDiff(a, b, keyF=id)",
		docs: ["Set difference operation (values in a but not b)."],
	},
	{
		func: "std.setMember(x, arr, keyF=id)",
		docs: ["Returns true if x is a member of array, otherwise false."],
	},
	{
		func: "std.get(o, f, default=null, inc_hidden=true)",
		docs: [
			"Returns the object's field if it exists or default value otherwise. inc_hidden controls whether to include hidden fields.",
		],
	},
	{
		func: "std.objectHas(o, f)",
		docs: [
			"Returns true if the given object has the field (given as a string), otherwise false. Raises an error if the arguments are not object and string respectively. Returns false if the field is hidden.",
		],
	},
	{
		func: "std.objectFields(o)",
		docs: [
			"Returns an array of strings, each element being a field from the given object. Does not include hidden fields.",
		],
	},
	{
		func: "std.objectValues(o)",
		docs: [
			"Returns an array of the values in the given object. Does not include hidden fields.",
		],
	},
	{
		func: "std.objectKeysValues(o)",
		docs: [
			"Returns an array of objects from the given object, each object having two fields: key (string) and value (object). Does not include hidden fields.",
		],
	},
	{
		func: "std.objectHasAll(o, f)",
		docs: ["As std.objectHas but also includes hidden fields."],
	},
	{
		func: "std.objectFieldsAll(o)",
		docs: ["As std.objectFields but also includes hidden fields."],
	},
	{
		func: "std.objectValuesAll(o)",
		docs: ["As std.objectValues but also includes hidden fields."],
	},
	{
		func: "std.objectKeysValuesAll(o)",
		docs: ["As std.objectKeysValues but also includes hidden fields."],
	},
	{
		func: "std.objectRemoveKey(obj, key)",
		docs: ["Returns a new object after removing the given key from object."],
	},
	{
		func: "std.mapWithKey(func, obj)",
		docs: [
			"Apply the given function to all fields of the given object, also passing the field name. The function func is expected to take the field name as the first parameter and the field value as the second.",
		],
	},
	{
		func: "std.base64(input)",
		docs: [
			"Encodes the given value into a base64 string. The encoding sequence is A-Za-z0-9+/ with = to pad the output to a multiple of 4 characters. The value can be a string or an array of numbers, but the codepoints / numbers must be in the 0 to 255 range. The resulting string has no line breaks.",
		],
	},
	{
		func: "std.base64DecodeBytes(str)",
		docs: [
			"Decodes the given base64 string into an array of bytes (number values). Currently assumes the input string has no linebreaks and is padded to a multiple of 4 (with the = character). In other words, it consumes the output of std.base64().",
		],
	},
	{
		func: "std.base64Decode(str)",
		docs: [
			"Deprecated, use std.base64DecodeBytes and decode the string explicitly (e.g. with std.decodeUTF8) instead.",
			"Behaves like std.base64DecodeBytes() except returns a naively encoded string instead of an array of bytes.",
		],
	},
	{
		func: "std.md5(s)",
		docs: ["Encodes the given value into an MD5 string."],
	},
	{
		func: "std.sha1(s)",
		docs: [
			"Encodes the given value into an SHA1 string.",
			"This function is only available in Go version of jsonnet.",
		],
	},
	{
		func: "std.sha256(s)",
		docs: [
			"Encodes the given value into an SHA256 string.",
			"This function is only available in Go version of jsonnet.",
		],
	},
	{
		func: "std.sha512(s)",
		docs: [
			"Encodes the given value into an SHA512 string.",
			"This function is only available in Go version of jsonnet.",
		],
	},
	{
		func: "std.sha3(s)",
		docs: [
			"Encodes the given value into an SHA3 string.",
			"This function is only available in Go version of jsonnet.",
		],
	},
	{
		func: "std.xor(x, y)",
		docs: ["Returns the xor of the two given booleans."],
	},
	{
		func: "std.xnor(x, y)",
		docs: ["Returns the xnor of the two given booleans."],
	},
	{
		func: "std.mergePatch(target, patch)",
		docs: ["Applies patch to target according to RFC7396"],
	},
	{ func: "std.abs(n)", docs: ["Return the absolute value of n"] },
	{
		func: "std.sign(n)",
		docs: ["Return 1 if n > 0, -1 if n < 0, and 0 if n == 0"],
	},
	{ func: "std.max(a, b)", docs: [] },
	{ func: "std.min(a, b)", docs: [] },
	{ func: "std.pow(x, n)", docs: ["Return x^n"] },
	{ func: "std.exp(x)", docs: ["Return e^x"] },
	{ func: "std.log(x)", docs: ["Return the natural log of x"] },
	{ func: "std.log2(x)", docs: [] },
	{ func: "std.log10(x)", docs: [] },
	{
		func: "std.exponent(x)",
		docs: ["Return the exponent of x as a floating point number"],
	},
	{
		func: "std.mantissa(x)",
		docs: ["Return the mantissa of x as a floating point number"],
	},
	{
		func: "std.floor(x)",
		docs: ["Return the greatest integer less than or equal to x"],
	},
	{
		func: "std.ceil(x)",
		docs: ["Return the least integer greater than or equal to x"],
	},
	{ func: "std.sqrt(x)", docs: ["Return the square root of x"] },
	{ func: "std.sin(x)", docs: [] },
	{ func: "std.cos(x)", docs: [] },
	{ func: "std.tan(x)", docs: [] },
	{ func: "std.asin(x)", docs: [] },
	{ func: "std.acos(x)", docs: [] },
	{ func: "std.atan(x)", docs: [] },
	{ func: "std.atan2(y, x)", docs: [] },
	{ func: "std.deg2rad(x)", docs: ["Convert an angle in degrees to radians"] },
	{ func: "std.rad2deg(x)", docs: ["Convert an angle in radians to degrees"] },
	{
		func: "std.hypot(a, b)",
		docs: [
			"Return sqrt(a^2 + b^2), but avoiding rounding errors when a and b are of different magnitudes",
		],
	},
	{ func: "std.round(x)", docs: ["Round x to the nearest integer"] },
	{ func: "std.isEven(x)", docs: ["Whether the integral part of x is even"] },
	{ func: "std.isOdd(x)", docs: ["Whether the integral part of x is od"] },
	{
		func: "std.mod(a, b)",
		docs: [
			"The % operator. If a is a number, returns a modulo b. If a is a string, calls std.format",
		],
	},
	{ func: "std.isInteger(x)", docs: ["Whether x is an integer"] },
	{ func: "std.isDecimal(x)", docs: ["Whether x is not an integer"] },
	{ func: "std.pi", docs: ["The constant pi"] },
].map(({ func, docs }) => {
	const name = func.match(/std\.(\w+)/)![1];
	const label = func.match(/std\.(.*)/)![1];
	return {
		label,
		type: "function",
		detail: docs[0],
		// insert the completion, then move the cursor to after the open paren
		apply: (view, completion, from, to) => {
			view.dispatch({ changes: { from, to, insert: completion.label } });
			view.dispatch({ selection: { anchor: from + name.length + 1 } });
		},
	};
});
