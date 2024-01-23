
const parseExt = require('./utils').parseFileExtension;

test('test parseFileExt', () => {
    
    expect(parseExt('zowe-1.0.0.pax.Z')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".pax.Z"})));
    expect(parseExt('zowe-1.0.0.pax.Z.bundle')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".pax.Z.bundle"})));
    expect(parseExt('zowe-1.0.0.pax.z.bundle')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".pax.z.bundle"})));

    expect(parseExt('zowe-1.0.0.tar.gz')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".tar.gz"})));
    expect(parseExt('zowe-1.0.0.tar.gz.bundle')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".tar.gz.bundle"})));

    expect(parseExt('path/to/zowe-1.0.0.tar.gz')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".tar.gz"})));
    expect(parseExt('path/to/zowe-1.0.0.tar.gz.bundle')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".tar.gz.bundle"})));

    expect(parseExt('zowe-1.0.0.tar')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".tar"})));
    expect(parseExt('zowe-1.0.0.tar.bundle')).toEqual(new Map(Object.entries({name: "zowe-1.0.0", ext: ".tar.bundle"})));


    expect(parseExt('abcdef')).toEqual(new Map(Object.entries({name: "abcdef", ext: ""})));
    expect(parseExt('abcdef.bundle')).toEqual(new Map(Object.entries({name: "abcdef", ext: ".bundle"})));
    expect(parseExt('abcdef.pax.f.d.s')).toEqual(new Map(Object.entries({name: "abcdef.pax.f.d", ext: ".s"})));
    expect(parseExt('abcdef.pax.f.d.s.bundle')).toEqual(new Map(Object.entries({name: "abcdef.pax.f.d", ext: ".s.bundle"})));

})